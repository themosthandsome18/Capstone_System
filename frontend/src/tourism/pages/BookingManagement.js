import { useEffect, useMemo, useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiFilter,
  FiSearch,
  FiEdit2,
  FiEye,
  FiTrash2,
  FiCheck,
  FiX,
  FiUpload,
} from "react-icons/fi";
import { useOutletContext } from "react-router-dom";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
import { useAuth } from "../../auth/AuthContext";
import { useTourismData } from "../context/TourismDataContext";

const pageSize = 10;

const initialForm = {
  full_name: "",
  email: "",
  consent_confirmed: "true",
  contact_number: "",
  country_id: "",
  region_id: "",
  province_id: "",
  country_of_origin: "",
  resort_id: "",
  itinerary_id: "",
  travel_mode_id: "",
  boat_type_id: "",
  boat_capacity_fare: "",
  parking_space: "",
  visit_purpose_id: "",
  arrival_date: "",
  filipino_count: "0",
  foreigner_count: "0",
  maubanin_count: "0",
  total_male: "0",
  total_female: "0",
  special_group_count: "0",
  age_0_7: "0",
  age_8_59: "0",
  age_60_above: "0",
};

const consentOptions = [
  { id: "true", name: "Yes" },
  { id: "false", name: "No" },
];

const boatCapacityFareOptions = [
  { id: "1-2 pax (One-Way P1500, Two-way P2000)", name: "1-2 pax (One-Way P1500, Two-way P2000)" },
  { id: "3-4 pax (One-Way P2000, Two-way P2,500)", name: "3-4 pax (One-Way P2000, Two-way P2,500)" },
  { id: "5-6 pax (One-Way P2,500, Two-way P3,000)", name: "5-6 pax (One-Way P2,500, Two-way P3,000)" },
  { id: "7-8 pax (One-Way P3,000, Two-way P3,500)", name: "7-8 pax (One-Way P3,000, Two-way P3,500)" },
  { id: "9-10 pax (One-Way P3,500, Two-way P4,000)", name: "9-10 pax (One-Way P3,500, Two-way P4,000)" },
  { id: "11-12 pax (One-Way P4,000, Two-way P4,500)", name: "11-12 pax (One-Way P4,000, Two-way P4,500)" },
  { id: "13-14 pax (One-Way P4,500, Two-way P5,000)", name: "13-14 pax (One-Way P4,500, Two-way P5,000)" },
  { id: "15-17 pax (One-Way P5,000, Two-way P5,500)", name: "15-17 pax (One-Way P5,000, Two-way P5,500)" },
  { id: "18-20 pax (One-Way P5,500, Two-way P6,000)", name: "18-20 pax (One-Way P5,500, Two-way P6,000)" },
];

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

const currentReportingYear = String(new Date().getFullYear());

const reportingYearOptions = [
  { value: "2026", label: "2026" },
  { value: "2025", label: "2025" },
  { value: "2024", label: "2024" },
  { value: "all", label: "All Years" },
];

function BookingManagement() {
  const {
    bookingManagement,
    referenceTables,
    createRecord,
    updateRecord,
    deleteRecord,
    previewOnlineBookingImport,
    importOnlineBookingFile,
    refreshBookingManagement,
  } = useTourismData();

  const { role } = useAuth();
  const { addEntryRequestId, globalSearch } = useOutletContext() || {};
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [tableError, setTableError] = useState("");
  const [loadingRows, setLoadingRows] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState("");
  const [filters, setFilters] = useState({
    year: currentReportingYear,
    status: "",
    resort_id: "",
    region_id: "",
    province_id: "",
    from: "",
    to: "",
  });
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (addEntryRequestId) {
      openAddRecord();
    }
  }, [addEntryRequestId]);

  useEffect(() => {
    if (globalSearch !== undefined) {
      setSearch(globalSearch);
      setPage(1);
    }
  }, [globalSearch]);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(async () => {
      setLoadingRows(true);
      setTableError("");

      try {
        const response = await refreshBookingManagement({
          ...filters,
          search,
          page,
          pageSize,
        });

        if (active && response.pagination.page !== page) {
          setPage(response.pagination.page);
        }
      } catch (error) {
        if (active) {
          setTableError(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setLoadingRows(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [filters, page, refreshBookingManagement, search]);

  function resolveLabel(collection = [], id, key = "id", valueKey = "name") {
    return (
      collection.find((item) => String(item[key]) === String(id))?.[valueKey] ||
      "--"
    );
  }

  const bookingRows = bookingManagement.rows || [];
  const bookingSummary = bookingManagement.summary || {};
  const bookingPagination = bookingManagement.pagination || {};
  const summary = {
    verifiedEntries: bookingSummary.verifiedEntries || 0,
    arrived: bookingSummary.arrived || 0,
    noShow: bookingSummary.noShow || 0,
  };
  const totalPages = bookingPagination.totalPages || 1;
  const paginatedRows = bookingRows;
  const provinceOptions = useMemo(() => {
    if (!form.region_id) {
      return referenceTables.provinces;
    }

    const filteredProvinces = referenceTables.provinces.filter(
      (province) => String(province.region_id || "") === String(form.region_id)
    );

    if (
      form.province_id &&
      !filteredProvinces.some(
        (province) => String(province.id) === String(form.province_id)
      )
    ) {
      const selectedProvince = referenceTables.provinces.find(
        (province) => String(province.id) === String(form.province_id)
      );

      if (selectedProvince) {
        return [selectedProvince, ...filteredProvinces];
      }
    }

    return filteredProvinces;
  }, [form.province_id, form.region_id, referenceTables.provinces]);
  const filterProvinceOptions = useMemo(() => {
    if (!filters.region_id) {
      return referenceTables.provinces;
    }

    return referenceTables.provinces.filter(
      (province) => String(province.region_id || "") === String(filters.region_id)
    );
  }, [filters.region_id, referenceTables.provinces]);
  const formTotals = useMemo(() => {
    const classification =
      toInteger(form.filipino_count) +
      toInteger(form.foreigner_count) +
      toInteger(form.maubanin_count);
    const gender = toInteger(form.total_male) + toInteger(form.total_female);
    const ages =
      toInteger(form.age_0_7) +
      toInteger(form.age_8_59) +
      toInteger(form.age_60_above);
    const special = toInteger(form.special_group_count);

    return {
      classification,
      gender,
      ages,
      special,
      genderMatches: classification === gender,
      agesMatch: classification === ages,
      specialValid: special <= classification,
    };
  }, [form]);

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
      consent_confirmed: String(record.consent_confirmed ?? true),
      contact_number: record.contact_number || "",
      country_id: String(record.country_id || ""),
      region_id: String(record.region_id || ""),
      province_id: String(record.province_id || ""),
      country_of_origin: record.country_of_origin || "",
      resort_id: String(record.resort_id || ""),
      itinerary_id: String(record.itinerary_id || ""),
      travel_mode_id: String(record.travel_mode_id || ""),
      boat_type_id: String(record.boat_type_id || ""),
      boat_capacity_fare: record.boat_capacity_fare || "",
      parking_space: record.parking_space || "",
      visit_purpose_id: String(record.visit_purpose_id || ""),
      arrival_date: record.arrival_date || "",
      filipino_count: String(record.filipino_count || 0),
      foreigner_count: String(record.foreigner_count || 0),
      maubanin_count: String(record.maubanin_count || 0),
      total_male: String(record.total_male || 0),
      total_female: String(record.total_female || 0),
      special_group_count: String(record.special_group_count || 0),
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
      ...(field === "region_id" ? { province_id: "" } : {}),
    }));
  }

  function updateFilter(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
      ...(field === "region_id" ? { province_id: "" } : {}),
    }));
    setPage(1);
  }

  function toInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function buildPayload() {
    const filipinoCount = toInteger(form.filipino_count);
    const foreignerCount = toInteger(form.foreigner_count);
    const maubaninCount = toInteger(form.maubanin_count);
    const totalVisitors = filipinoCount + foreignerCount + maubaninCount;

    return {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      consent_confirmed: form.consent_confirmed === "true",
      contact_number: form.contact_number.trim(),
      country_id: Number(form.country_id),
      region_id: Number(form.region_id),
      province_id: Number(form.province_id),
      country_of_origin: form.country_of_origin.trim(),
      resort_id: Number(form.resort_id),
      itinerary_id: Number(form.itinerary_id),
      travel_mode_id: Number(form.travel_mode_id),
      boat_type_id: Number(form.boat_type_id),
      boat_capacity_fare: form.boat_capacity_fare.trim(),
      parking_space: form.parking_space.trim(),
      visit_purpose_id: Number(form.visit_purpose_id),
      arrival_date: form.arrival_date,
      filipino_count: filipinoCount,
      foreigner_count: foreignerCount,
      maubanin_count: maubaninCount,
      total_visitors: totalVisitors,
      total_male: toInteger(form.total_male),
      total_female: toInteger(form.total_female),
      special_group_count: toInteger(form.special_group_count),
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
      return "Filipino + foreigner + Maubanin count must equal total male + total female.";
    }

    if (payload.total_visitors !== ageTotal) {
      return "Filipino + foreigner + Maubanin count must equal age 0-7 + age 8-59 + age 60+.";
    }

    if (payload.special_group_count > payload.total_visitors) {
      return "Senior/PWD/7 below count cannot be greater than total visitors.";
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

  async function loadBookingRows(overrides = {}) {
    setLoadingRows(true);
    setTableError("");

    try {
      const response = await refreshBookingManagement({
        ...filters,
        search,
        page,
        pageSize,
        ...overrides,
      });

      if (response.pagination.page !== page) {
        setPage(response.pagination.page);
      }

      return response;
    } catch (error) {
      setTableError(getErrorMessage(error));
      return null;
    } finally {
      setLoadingRows(false);
    }
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
      await loadBookingRows({ page: 1 });
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
      await updateRecord(
        record.survey_id,
        { status: nextStatus },
        { refreshComputed: false }
      );
      setUpdatingStatus("");
      loadBookingRows();
    } catch (error) {
      setTableError(getErrorMessage(error));
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
      await loadBookingRows({ page: 1 });
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function fillGenderBalance() {
    setForm((current) => {
      const total = toInteger(current.filipino_count) + toInteger(current.foreigner_count) + toInteger(current.maubanin_count);
      const male = Math.min(toInteger(current.total_male), total);

      return {
        ...current,
        total_male: String(male),
        total_female: String(Math.max(total - male, 0)),
      };
    });
  }

  function fillAgeBalance() {
    setForm((current) => {
      const total = toInteger(current.filipino_count) + toInteger(current.foreigner_count) + toInteger(current.maubanin_count);
      const age0To7 = Math.min(toInteger(current.age_0_7), total);
      const age60Above = Math.min(toInteger(current.age_60_above), Math.max(total - age0To7, 0));

      return {
        ...current,
        age_0_7: String(age0To7),
        age_60_above: String(age60Above),
        age_8_59: String(Math.max(total - age0To7 - age60Above, 0)),
      };
    });
  }

  async function handlePreviewImport(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setImportFile(file);
    setImportPreview(null);
    setImportError("");
    setImporting(true);

    try {
      const result = await previewOnlineBookingImport(file);
      setImportPreview(result);
    } catch (error) {
      setImportError(getErrorMessage(error));
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  async function handleConfirmImport() {
    if (!importFile) {
      return;
    }

    setImporting(true);
    setImportError("");

    try {
      const result = await importOnlineBookingFile(importFile);
      setImportPreview(result);
      setImportFile(null);
      setPage(1);
      await loadBookingRows({ page: 1 });
    } catch (error) {
      setImportError(getErrorMessage(error));
    } finally {
      setImporting(false);
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
      "Region",
      "Province",
      "Pax",
      "Arrival",
      "Travel Itinerary",
      "Resort",
      "Status",
    ];

    const rows = bookingRows.map((record) => [
      record.survey_id,
      record.full_name,
      record.contact_number,
      record.country_name || resolveLabel(referenceTables.countries, record.country_id),
      record.region_name || resolveLabel(referenceTables.regions, record.region_id),
      record.province_name || resolveLabel(referenceTables.provinces, record.province_id),
      record.total_visitors,
      record.arrival_date,
      record.itinerary_name || resolveLabel(referenceTables.itineraries, record.itinerary_id),
      record.resort_name ||
        resolveLabel(
          referenceTables.resorts,
          record.resort_id,
          "resort_id",
          "resort_name"
        ),
      statusLabels[record.status] || "Pending",
    ]);

    exportCsv(datedCsvFilename("booking-management"), headers, rows);
  }

  function exportImportIssues() {
    if (!importPreview) {
      return;
    }

    const headers = ["Type", "Row", "Guest", "Contact", "Arrival Date", "Resort", "Message"];
    const rows = [
      ...(importPreview.error_samples || []).map((row) => [
        "Skipped",
        row.row,
        row.guest || "",
        row.contact || "",
        row.arrival_date || "",
        row.resort || "",
        row.message,
      ]),
      ...(importPreview.duplicate_samples || []).map((row) => [
        "Duplicate",
        row.row,
        row.guest || "",
        row.contact || "",
        row.arrival_date || "",
        row.resort || "",
        row.message,
      ]),
    ];

    exportCsv(datedCsvFilename("online-booking-import-issues"), headers, rows);
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
            Export CSV
          </button>
          {isAdmin ? (
            <label className="outline-action booking-import-btn">
              <FiUpload />
              Import Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handlePreviewImport}
                hidden
              />
            </label>
          ) : null}
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

      <div className="booking-filter-grid">
        <select
          value={filters.year}
          onChange={(event) => updateFilter("year", event.target.value)}
        >
          {reportingYearOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(event) => updateFilter("status", event.target.value)}
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="arrived">Arrived</option>
          <option value="no_show">No-show</option>
        </select>

        <select
          value={filters.resort_id}
          onChange={(event) => updateFilter("resort_id", event.target.value)}
        >
          <option value="">All Resorts</option>
          {referenceTables.resorts.map((resort) => (
            <option key={resort.resort_id} value={resort.resort_id}>
              {resort.resort_name}
            </option>
          ))}
        </select>

        <select
          value={filters.region_id}
          onChange={(event) => updateFilter("region_id", event.target.value)}
        >
          <option value="">All Regions</option>
          {referenceTables.regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>

        <select
          value={filters.province_id}
          onChange={(event) => updateFilter("province_id", event.target.value)}
        >
          <option value="">All Provinces</option>
          {filterProvinceOptions.map((province) => (
            <option key={province.id} value={province.id}>
              {province.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filters.from}
          onChange={(event) => updateFilter("from", event.target.value)}
        />

        <input
          type="date"
          value={filters.to}
          onChange={(event) => updateFilter("to", event.target.value)}
        />
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
                  "Travel Itinerary",
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
                          {row.country_name ||
                            resolveLabel(referenceTables.countries, row.country_id)}
                        </strong>
                      </td>

                      <td>{row.total_visitors}</td>
                      <td>{formatDate(row.arrival_date)}</td>
                      <td>
                        {row.itinerary_name ||
                          resolveLabel(referenceTables.itineraries, row.itinerary_id)}
                      </td>

                      <td>
                        {row.resort_name ||
                          resolveLabel(
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
                            className="booking-icon-btn view"
                            disabled={Boolean(updatingStatus)}
                            onClick={() => setDetailRecord(row)}
                            title="View record"
                            aria-label="View record"
                          >
                            <FiEye/>
                          </button>

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

                          {isAdmin ? (
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
          ) : null}

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
                    {loadingRows ? "Loading booking records..." : "No booking records found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="booking-pagination">
        <p>
          Showing{" "}
          <strong>
            {bookingPagination.showingStart || 0}-{bookingPagination.showingEnd || 0}
          </strong>{" "}
          of <strong>{bookingPagination.total || 0}</strong> filtered records
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
            className="tourist-record-form w-full max-w-[760px]"
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

              <SelectField
                label="Consent Form"
                value={form.consent_confirmed}
                placeholder="Select consent"
                options={consentOptions}
                onChange={(value) => updateField("consent_confirmed", value)}
                required
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
                placeholder={
                  form.region_id ? "Select province" : "Select region first"
                }
                options={provinceOptions}
                onChange={(value) => updateField("province_id", value)}
                required
                disabled={!form.region_id}
              />

              <TextField
                label="Country of Origin"
                value={form.country_of_origin}
                onChange={(value) => updateField("country_of_origin", value)}
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
                label="Travel Itinerary"
                value={form.itinerary_id}
                placeholder="Select itinerary"
                options={referenceTables.itineraries}
                onChange={(value) => updateField("itinerary_id", value)}
                required
              />

              <SelectField
                label="Vehicle Classification"
                value={form.travel_mode_id}
                placeholder="Select mode"
                options={referenceTables.travelModes}
                onChange={(value) => updateField("travel_mode_id", value)}
                required
              />

              <SelectField
                label="Boat Classification"
                value={form.boat_type_id}
                placeholder="Select boat"
                options={referenceTables.boatTypes}
                onChange={(value) => updateField("boat_type_id", value)}
                required
              />

              <SelectField
                label="Boat Capacity and Fare"
                value={form.boat_capacity_fare}
                placeholder="Select capacity and fare"
                options={boatCapacityFareOptions}
                onChange={(value) => updateField("boat_capacity_fare", value)}
              />

              <TextField
                label="Your Parking Space"
                value={form.parking_space}
                onChange={(value) => updateField("parking_space", value)}
              />

              <SelectField
                label="Purpose of Travel"
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
                label="How many Filipinos are in your Group?"
                value={form.filipino_count}
                onChange={(value) => updateField("filipino_count", value)}
              />

              <NumberField
                label="How many Foreigners are in your Group?"
                value={form.foreigner_count}
                onChange={(value) => updateField("foreigner_count", value)}
              />

              <NumberField
                label="How many Maubanin residents are in your Group?"
                value={form.maubanin_count}
                onChange={(value) => updateField("maubanin_count", value)}
              />

              <NumberField
                label="Total Number of Male"
                value={form.total_male}
                onChange={(value) => updateField("total_male", value)}
              />

              <NumberField
                label="Total Number of Female"
                value={form.total_female}
                onChange={(value) => updateField("total_female", value)}
              />

              <NumberField
                label="Senior Citizen, PWD, and 7 years old and below"
                value={form.special_group_count}
                onChange={(value) => updateField("special_group_count", value)}
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

            <div className="tourist-total-check">
              <TotalCheckItem
                label="Visitor classification"
                value={`${formTotals.classification} total`}
                ok
              />
              <TotalCheckItem
                label="Male + Female"
                value={`${formTotals.gender} total`}
                ok={formTotals.genderMatches}
              />
              <TotalCheckItem
                label="Age groups"
                value={`${formTotals.ages} total`}
                ok={formTotals.agesMatch}
              />
              <TotalCheckItem
                label="Senior/PWD/7 below"
                value={`${formTotals.special} total`}
                ok={formTotals.specialValid}
              />
            </div>

            <div className="tourist-auto-fill-row">
              <button type="button" onClick={fillGenderBalance}>
                Balance female count
              </button>
              <button type="button" onClick={fillAgeBalance}>
                Balance age 8-59
              </button>
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

      {importPreview || importError || importing ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10">
          <div className="import-preview-modal w-full max-w-[720px]">
            <h2>Online Booking Import Preview</h2>
            <p>
              Valid rows are ready for import. Skipped rows have inconsistent
              totals or missing required values.
            </p>

            {importing ? <p className="import-status">Processing Excel file...</p> : null}
            {importError ? <p className="tourist-record-error">{importError}</p> : null}

            {importPreview ? (
              <>
                <div className="import-summary-grid">
                  <ImportStat label="Valid" value={importPreview.valid_count} />
                  <ImportStat label="Skipped" value={importPreview.skipped_count} />
                  <ImportStat label="Duplicates" value={importPreview.duplicate_count} />
                  <ImportStat label="New resorts" value={importPreview.new_resort_count} />
                  <ImportStat label="Created" value={importPreview.imported_count} />
                  <ImportStat label="Updated" value={importPreview.updated_count} />
                </div>

                <div className="import-sample-grid">
                  <section>
                    <h3>Sample Valid Rows</h3>
                    {importPreview.valid_samples?.length ? (
                      importPreview.valid_samples.map((row) => (
                        <p key={`${row.row}-${row.survey_id}`}>
                          Row {row.row}: {row.guest} - {row.resort} ({row.total_visitors})
                        </p>
                      ))
                    ) : (
                      <p>No valid sample rows.</p>
                    )}
                  </section>

                  <section>
                    <h3>Sample Skipped Rows</h3>
                    {importPreview.error_samples?.length ? (
                      importPreview.error_samples.map((row) => (
                        <p key={row.row}>
                          Row {row.row}: {row.message}
                        </p>
                      ))
                    ) : (
                      <p>No skipped sample rows.</p>
                    )}
                  </section>

                  <section>
                    <h3>Possible Duplicates</h3>
                    {importPreview.duplicate_samples?.length ? (
                      importPreview.duplicate_samples.map((row) => (
                        <p key={`duplicate-${row.row}`}>
                          Row {row.row}: {row.guest} - {row.resort}
                        </p>
                      ))
                    ) : (
                      <p>No duplicates found.</p>
                    )}
                  </section>

                  <section>
                    <h3>New Resorts to Review</h3>
                    {importPreview.new_resort_samples?.length ? (
                      importPreview.new_resort_samples.map((name) => (
                        <p key={name}>{name}</p>
                      ))
                    ) : (
                      <p>No new resort names found.</p>
                    )}
                  </section>
                </div>
              </>
            ) : null}

            <div className="tourist-record-actions">
              <button
                type="button"
                className="tourist-record-cancel"
                disabled={!importPreview || importing}
                onClick={exportImportIssues}
              >
                Export Issues
              </button>
              <button
                type="button"
                className="tourist-record-cancel"
                disabled={importing}
                onClick={() => {
                  setImportPreview(null);
                  setImportError("");
                  setImportFile(null);
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="tourist-record-save"
                disabled={importing || !importFile || !importPreview?.valid_count}
                onClick={handleConfirmImport}
              >
                {importing ? "Importing..." : "Import Valid Rows"}
              </button>
            </div>
          </div>
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

      {detailRecord ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10">
          <div className="booking-detail-modal w-full max-w-[680px]">
            <div className="booking-detail-header">
              <div>
                <h2>{detailRecord.full_name}</h2>
                <p>{detailRecord.survey_id}</p>
              </div>
              <span className={`booking-badge ${statusClassNames[detailRecord.status] || "pending"}`}>
                {statusLabels[detailRecord.status] || "Pending"}
              </span>
            </div>

            <div className="booking-detail-grid">
              <DetailItem label="Contact" value={detailRecord.contact_number} />
              <DetailItem label="Email" value={detailRecord.email || "--"} />
              <DetailItem label="Arrival Date" value={formatDate(detailRecord.arrival_date)} />
              <DetailItem label="Resort" value={resolveLabel(referenceTables.resorts, detailRecord.resort_id, "resort_id", "resort_name")} />
              <DetailItem label="Region" value={resolveLabel(referenceTables.regions, detailRecord.region_id)} />
              <DetailItem label="Province" value={resolveLabel(referenceTables.provinces, detailRecord.province_id)} />
              <DetailItem label="Travel Itinerary" value={resolveLabel(referenceTables.itineraries, detailRecord.itinerary_id)} />
              <DetailItem label="Purpose" value={resolveLabel(referenceTables.visitPurposes, detailRecord.visit_purpose_id)} />
              <DetailItem label="Vehicle" value={resolveLabel(referenceTables.travelModes, detailRecord.travel_mode_id)} />
              <DetailItem label="Boat" value={resolveLabel(referenceTables.boatTypes, detailRecord.boat_type_id)} />
              <DetailItem label="Boat Capacity/Fare" value={detailRecord.boat_capacity_fare || "--"} />
              <DetailItem label="Parking" value={detailRecord.parking_space || "--"} />
              <DetailItem label="Filipino" value={detailRecord.filipino_count} />
              <DetailItem label="Foreigner" value={detailRecord.foreigner_count} />
              <DetailItem label="Maubanin" value={detailRecord.maubanin_count} />
              <DetailItem label="Total Visitors" value={detailRecord.total_visitors} />
              <DetailItem label="Male" value={detailRecord.total_male} />
              <DetailItem label="Female" value={detailRecord.total_female} />
              <DetailItem label="Age 0-7" value={detailRecord.age_0_7} />
              <DetailItem label="Age 8-59" value={detailRecord.age_8_59} />
              <DetailItem label="Age 60+" value={detailRecord.age_60_above} />
              <DetailItem label="Senior/PWD/7 below" value={detailRecord.special_group_count} />
            </div>

            <div className="tourist-record-actions">
              <button
                type="button"
                className="tourist-record-cancel"
                onClick={() => setDetailRecord(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="tourist-record-save"
                onClick={() => {
                  openEditRecord(detailRecord);
                  setDetailRecord(null);
                }}
              >
                Edit Record
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TotalCheckItem({ label, value, ok }) {
  return (
    <div className={`total-check-item ${ok ? "ok" : "error"}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ImportStat({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{Number(value || 0).toLocaleString()}</strong>
    </div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="booking-detail-item">
      <span>{label}</span>
      <strong>{value || "--"}</strong>
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
  disabled = false,
}) {
  return (
    <label className="tourist-record-field">
      <span>{label}</span>
      <select
        value={value}
        required={required}
        disabled={disabled}
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
