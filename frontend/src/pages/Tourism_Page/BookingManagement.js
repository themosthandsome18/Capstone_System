import { useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiFilter,
  FiPlus,
  FiSearch,
  FiTrash2,
} from "react-icons/fi";
import Modal from "../../components/ui/Modal";
import { useTourismData } from "../../context/TourismDataContext";

const pageSize = 10;

const statusOptions = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "arrived", label: "Arrived" },
  { value: "no_show", label: "No-show" },
];

const statusLabels = {
  pending: "Pending",
  arrived: "Arrived",
  no_show: "No-show",
};

function fallbackStatus(index) {
  if (index === 0 || index === 6 || index === 7) {
    return "pending";
  }

  if (index === 3) {
    return "no_show";
  }

  return "arrived";
}

function getStatus(record, index) {
  return record.status || fallbackStatus(index);
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

function escapeCsvValue(value) {
  const normalized = value ?? "";
  return `"${String(normalized).replace(/"/g, '""')}"`;
}

function createEmptyRecordForm() {
  return {
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
    maubanin_count: "0",
    special_group_count: "0",
    status: "pending",
  };
}

function createRecordFormFromRecord(record) {
  return {
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
    filipino_count: String(record.filipino_count ?? 0),
    foreigner_count: String(record.foreigner_count ?? 0),
    total_male: String(record.total_male ?? 0),
    total_female: String(record.total_female ?? 0),
    age_0_7: String(record.age_0_7 ?? 0),
    age_8_59: String(record.age_8_59 ?? 0),
    age_60_above: String(record.age_60_above ?? 0),
    maubanin_count: String(record.maubanin_count ?? 0),
    special_group_count: String(record.special_group_count ?? 0),
    status: record.status || "pending",
  };
}

function toNumber(value) {
  return Number.parseInt(value || "0", 10);
}

function formatApiErrors(details) {
  if (!details || typeof details !== "object") {
    return "Unable to save tourist record. Please check the form values.";
  }

  return Object.entries(details)
    .map(([field, messages]) => {
      const text = Array.isArray(messages) ? messages.join(" ") : messages;
      return `${field}: ${text}`;
    })
    .join(" ");
}

function BookingManagement() {
  const {
    touristRecords,
    referenceTables,
    createRecord,
    updateRecord,
    deleteRecord,
  } = useTourismData();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [recordForm, setRecordForm] = useState(createEmptyRecordForm);
  const [formError, setFormError] = useState("");
  const [savingRecord, setSavingRecord] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [updatingSurveyId, setUpdatingSurveyId] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  function resolveLabel(collection, id, key = "id", valueKey = "name") {
    return collection.find((item) => item[key] === id)?.[valueKey] || "--";
  }

  const rowsWithStatus = touristRecords.map((record, index) => ({
    ...record,
    status: getStatus(record, index),
  }));

  const filteredRows = rowsWithStatus.filter((record) => {
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
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = searchText.includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || record.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = filteredRows.slice(
    (page - 1) * pageSize,
    page * pageSize
  );
  const arrivedCount = rowsWithStatus.filter(
    (row) => row.status === "arrived"
  ).length;
  const noShowCount = rowsWithStatus.filter(
    (row) => row.status === "no_show"
  ).length;
  const totalVisitors = filteredRows.reduce(
    (total, row) => total + row.total_visitors,
    0
  );

  function buildCsvRows() {
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
    const rows = filteredRows.map((row) => [
      row.survey_id,
      row.full_name,
      row.contact_number,
      resolveLabel(referenceTables.countries, row.country_id),
      row.total_visitors,
      row.arrival_date,
      resolveLabel(
        referenceTables.resorts,
        row.resort_id,
        "resort_id",
        "resort_name"
      ),
      statusLabels[row.status] || row.status,
    ]);

    return [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");
  }

  function handleExport() {
    const csv = buildCsvRows();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `booking-records-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    setActionError("");
    setActionMessage(`Exported ${filteredRows.length} booking records.`);
  }

  async function handleStatusChange(row, status) {
    setUpdatingSurveyId(row.survey_id);
    setActionMessage("");
    setActionError("");

    try {
      await updateRecord(row.survey_id, { status });
      setActionMessage(
        `${row.survey_id} marked as ${statusLabels[status] || status}.`
      );
    } catch (error) {
      setActionError("Unable to update booking status. Please check the backend.");
    } finally {
      setUpdatingSurveyId("");
    }
  }

  function handleRecordFieldChange(event) {
    const { name, value } = event.target;
    setRecordForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function openCreateRecordModal() {
    setEditingRecord(null);
    setRecordForm(createEmptyRecordForm());
    setFormError("");
    setRecordModalOpen(true);
  }

  function openEditRecordModal(row) {
    setEditingRecord(row);
    setRecordForm(createRecordFormFromRecord(row));
    setFormError("");
    setRecordModalOpen(true);
  }

  function closeRecordModal() {
    if (savingRecord) {
      return;
    }

    setRecordModalOpen(false);
    setEditingRecord(null);
    setFormError("");
    setRecordForm(createEmptyRecordForm());
  }

  function buildRecordPayload() {
    const filipinoCount = toNumber(recordForm.filipino_count);
    const foreignerCount = toNumber(recordForm.foreigner_count);
    const maubaninCount = toNumber(recordForm.maubanin_count);

    return {
      ...recordForm,
      country_id: toNumber(recordForm.country_id),
      region_id: toNumber(recordForm.region_id),
      province_id: toNumber(recordForm.province_id),
      resort_id: toNumber(recordForm.resort_id),
      itinerary_id: toNumber(recordForm.itinerary_id),
      travel_mode_id: toNumber(recordForm.travel_mode_id),
      boat_type_id: toNumber(recordForm.boat_type_id),
      visit_purpose_id: toNumber(recordForm.visit_purpose_id),
      filipino_count: filipinoCount,
      foreigner_count: foreignerCount,
      maubanin_count: maubaninCount,
      total_visitors: filipinoCount + foreignerCount + maubaninCount,
      total_male: toNumber(recordForm.total_male),
      total_female: toNumber(recordForm.total_female),
      special_group_count: toNumber(recordForm.special_group_count),
      age_0_7: toNumber(recordForm.age_0_7),
      age_8_59: toNumber(recordForm.age_8_59),
      age_60_above: toNumber(recordForm.age_60_above),
      status: recordForm.status || "pending",
    };
  }

  async function handleSaveRecord(event) {
    event.preventDefault();
    setSavingRecord(true);
    setFormError("");
    setActionMessage("");
    setActionError("");

    const payload = buildRecordPayload();

    try {
      if (editingRecord) {
        await updateRecord(editingRecord.survey_id, payload);
        setActionMessage(`${editingRecord.survey_id} updated successfully.`);
      } else {
        await createRecord(payload);
        setActionMessage("Tourist record saved successfully.");
      }

      setRecordModalOpen(false);
      setEditingRecord(null);
      setRecordForm(createEmptyRecordForm());
    } catch (error) {
      setFormError(formatApiErrors(error.details));
    } finally {
      setSavingRecord(false);
    }
  }

  async function handleDeleteRecord() {
    if (!deleteCandidate) {
      return;
    }

    setDeletingRecord(true);
    setActionMessage("");
    setActionError("");

    try {
      await deleteRecord(deleteCandidate.survey_id);
      setActionMessage(`${deleteCandidate.survey_id} deleted successfully.`);
      setDeleteCandidate(null);
    } catch (error) {
      setActionError("Unable to delete tourist record. Please check the backend.");
    } finally {
      setDeletingRecord(false);
    }
  }

  return (
    <div className="booking-page">
      <div className="booking-header">
        <div>
          <h1>Booking Management</h1>
          <p>Replace manual Google Forms with automated booking tracking</p>
        </div>

        <div className="booking-actions">
          <button
            type="button"
            className="primary-action"
            onClick={openCreateRecordModal}
          >
            <FiPlus />
            Add Tourist Record
          </button>
          <button type="button" className="outline-action" onClick={handleExport}>
            <FiDownload />
            Export
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => setReportOpen(true)}
          >
            <FiFileText />
            Generate Report
          </button>
        </div>
      </div>

      <div className="booking-status-grid">
        <div className="booking-status-card verified">
          <p>Verified Entries</p>
          <h2>{touristRecords.length}</h2>
        </div>

        <div className="booking-status-card arrived">
          <p>Arrived</p>
          <h2>{arrivedCount}</h2>
        </div>

        <div className="booking-status-card noshow">
          <p>No-show</p>
          <h2>{noShowCount}</h2>
        </div>
      </div>

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

        <div className="flex items-center gap-3">
          {showFilters ? (
            <select
              className="h-10 rounded-full border border-[#2fa34a] bg-white px-4 text-sm font-semibold text-slate-700 outline-none"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowFilters((value) => !value)}
          >
            <FiFilter />
            Filter
          </button>
        </div>
      </div>

      {actionMessage ? (
        <div className="rounded-xl bg-green-100 px-4 py-3 text-sm font-semibold text-green-700">
          {actionMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-700">
          {actionError}
        </div>
      ) : null}

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
              {paginatedRows.map((row) => {
                const statusLabel = statusLabels[row.status] || "Pending";
                const updating = updatingSurveyId === row.survey_id;

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
                    <td>1</td>

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
                          row.status === "arrived"
                            ? "arrived"
                            : row.status === "pending"
                            ? "pending"
                            : "noshow"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </td>

                    <td>
                      <div className="booking-row-actions">
                        <button
                          type="button"
                          className="booking-edit-btn"
                          onClick={() => openEditRecordModal(row)}
                        >
                          <FiEdit2 />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="booking-delete-btn"
                          onClick={() => setDeleteCandidate(row)}
                        >
                          <FiTrash2 />
                        </button>
                        <button
                          type="button"
                          className="booking-arrived-btn"
                          disabled={updating || row.status === "arrived"}
                          onClick={() => handleStatusChange(row, "arrived")}
                        >
                          Arrived
                        </button>
                        <button
                          type="button"
                          className="booking-noshow-btn"
                          disabled={updating || row.status === "no_show"}
                          onClick={() => handleStatusChange(row, "no_show")}
                        >
                          No-show
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      <Modal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Booking Report"
        description="Summary based on the current search and filter."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-white p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Records</p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-900">
              {filteredRows.length}
            </h3>
          </div>
          <div className="rounded-lg bg-white p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Visitors</p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-900">
              {totalVisitors}
            </h3>
          </div>
          <div className="rounded-lg bg-white p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Arrived</p>
            <h3 className="mt-2 text-2xl font-extrabold text-green-700">
              {filteredRows.filter((row) => row.status === "arrived").length}
            </h3>
          </div>
          <div className="rounded-lg bg-white p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Pending</p>
            <h3 className="mt-2 text-2xl font-extrabold text-yellow-600">
              {filteredRows.filter((row) => row.status === "pending").length}
            </h3>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" className="primary-action" onClick={handleExport}>
            <FiDownload />
            Export Report CSV
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={recordModalOpen}
        onClose={closeRecordModal}
        title={editingRecord ? "Edit Tourist Record" : "Add Tourist Record"}
        description={
          editingRecord
            ? `Editing ${editingRecord.survey_id}`
            : "Data Management Add Record"
        }
      >
        <form className="tourist-record-form" onSubmit={handleSaveRecord}>
          <div className="tourist-record-grid">
            <FormField
              label="Full Name"
              name="full_name"
              placeholder="Full Name"
              value={recordForm.full_name}
              onChange={handleRecordFieldChange}
              required
            />
            <FormField
              label="Email"
              name="email"
              type="email"
              placeholder="Email"
              value={recordForm.email}
              onChange={handleRecordFieldChange}
            />
            <FormField
              label="Contact Number"
              name="contact_number"
              placeholder="+63..."
              value={recordForm.contact_number}
              onChange={handleRecordFieldChange}
              required
            />
            <FormSelect
              label="Country"
              name="country_id"
              placeholder="Select country"
              value={recordForm.country_id}
              options={referenceTables.countries}
              onChange={handleRecordFieldChange}
              required
            />
            <FormSelect
              label="Region"
              name="region_id"
              placeholder="Select region"
              value={recordForm.region_id}
              options={referenceTables.regions}
              onChange={handleRecordFieldChange}
              required
            />
            <FormSelect
              label="Province"
              name="province_id"
              placeholder="Select province"
              value={recordForm.province_id}
              options={referenceTables.provinces}
              onChange={handleRecordFieldChange}
              required
            />
            <FormSelect
              label="Resort"
              name="resort_id"
              placeholder="Select resort"
              value={recordForm.resort_id}
              options={referenceTables.resorts}
              optionKey="resort_id"
              optionLabel="resort_name"
              onChange={handleRecordFieldChange}
              required
            />
            <FormSelect
              label="Itinerary"
              name="itinerary_id"
              placeholder="Select itinerary"
              value={recordForm.itinerary_id}
              options={referenceTables.itineraries}
              onChange={handleRecordFieldChange}
              required
            />
            <FormSelect
              label="Travel Mode"
              name="travel_mode_id"
              placeholder="Select mode"
              value={recordForm.travel_mode_id}
              options={referenceTables.travelModes}
              onChange={handleRecordFieldChange}
              required
            />
            <FormSelect
              label="Boat Type"
              name="boat_type_id"
              placeholder="Select boat"
              value={recordForm.boat_type_id}
              options={referenceTables.boatTypes}
              onChange={handleRecordFieldChange}
              required
            />
            <FormSelect
              label="Visit Purpose"
              name="visit_purpose_id"
              placeholder="Select Purpose"
              value={recordForm.visit_purpose_id}
              options={referenceTables.visitPurposes}
              onChange={handleRecordFieldChange}
              required
            />
            <FormField
              label="Arrival Date"
              name="arrival_date"
              type="date"
              value={recordForm.arrival_date}
              onChange={handleRecordFieldChange}
              required
            />
            <FormField
              label="Filipino Count"
              name="filipino_count"
              type="number"
              min="0"
              value={recordForm.filipino_count}
              onChange={handleRecordFieldChange}
            />
            <FormField
              label="Foreigner Count"
              name="foreigner_count"
              type="number"
              min="0"
              value={recordForm.foreigner_count}
              onChange={handleRecordFieldChange}
            />
            <FormField
              label="Total Male"
              name="total_male"
              type="number"
              min="0"
              value={recordForm.total_male}
              onChange={handleRecordFieldChange}
            />
            <FormField
              label="Total Female"
              name="total_female"
              type="number"
              min="0"
              value={recordForm.total_female}
              onChange={handleRecordFieldChange}
            />
            <FormField
              label="Age 0-7"
              name="age_0_7"
              type="number"
              min="0"
              value={recordForm.age_0_7}
              onChange={handleRecordFieldChange}
            />
            <FormField
              label="Age 8-59"
              name="age_8_59"
              type="number"
              min="0"
              value={recordForm.age_8_59}
              onChange={handleRecordFieldChange}
            />
            <FormField
              label="Age 60+"
              name="age_60_above"
              type="number"
              min="0"
              value={recordForm.age_60_above}
              onChange={handleRecordFieldChange}
            />
          </div>

          {formError ? <p className="tourist-record-error">{formError}</p> : null}

          <div className="tourist-record-actions">
            <button
              type="button"
              className="tourist-record-cancel"
              onClick={closeRecordModal}
              disabled={savingRecord}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tourist-record-save"
              disabled={savingRecord}
            >
              {savingRecord
                ? "Saving..."
                : editingRecord
                ? "Update Record"
                : "Save Record"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteCandidate)}
        onClose={() => {
          if (!deletingRecord) {
            setDeleteCandidate(null);
          }
        }}
        title="Delete Tourist Record"
        description="This action removes the booking record from the database."
      >
        <div className="delete-record-confirm">
          <p>
            Delete{" "}
            <strong>{deleteCandidate?.survey_id}</strong>
            {deleteCandidate?.full_name ? ` for ${deleteCandidate.full_name}` : ""}?
          </p>
          <div className="delete-record-actions">
            <button
              type="button"
              className="tourist-record-cancel"
              onClick={() => setDeleteCandidate(null)}
              disabled={deletingRecord}
            >
              Cancel
            </button>
            <button
              type="button"
              className="delete-record-confirm-btn"
              onClick={handleDeleteRecord}
              disabled={deletingRecord}
            >
              {deletingRecord ? "Deleting..." : "Delete Record"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FormField({ label, name, type = "text", value, onChange, ...props }) {
  return (
    <label className="tourist-record-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        {...props}
      />
    </label>
  );
}

function FormSelect({
  label,
  name,
  value,
  options,
  onChange,
  placeholder,
  optionKey = "id",
  optionLabel = "name",
  ...props
}) {
  return (
    <label className="tourist-record-field">
      <span>{label}</span>
      <select name={name} value={value} onChange={onChange} {...props}>
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
