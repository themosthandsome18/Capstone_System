import { useEffect, useMemo, useState } from "react";
import "./BookingManagement.wizard.css";
import {
  FiChevronLeft,
  FiChevronRight,
  FiFilter,
  FiSearch,
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
  first_name: "",
  last_name: "",
  email: "",
  contact_number: "",
  country_id: "",
  region_id: "",
  province_id: "",
  resort_id: "",
  itinerary_id: "",
  travel_mode_id: "",
  boat_type_id: "",
  boat_capacity_fare: "",
  visit_purpose_id: "",
  arrival_date: "",
  filipino_count: "0",
  foreigner_count: "0",
  total_male: "0",
  total_female: "0",
  special_group_count: "0",
  age_0_7: "0",
  age_8_59: "0",
  age_60_above: "0",
};

const WIZARD_STEPS = [
  { label: "Tourist Info", sub: "Who is visiting?" },
  { label: "Location", sub: "Where are they going?" },
  { label: "Travel Details", sub: "How and why" },
  { label: "Head Count", sub: "How many people?" },
  { label: "Review", sub: "Check and save" },
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

function getFirstName(record) {
  if (!record) return "";
  if (record.first_name) return record.first_name;
  if (!record.full_name) return "";
  const parts = record.full_name.trim().split(" ");
  return parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
}

function getLastName(record) {
  if (!record) return "";
  if (record.last_name) return record.last_name;
  if (!record.full_name) return "";
  const parts = record.full_name.trim().split(" ");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  const { addEntryRequestId } = useOutletContext() || {};
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const todayDateString = useMemo(() => getTodayDateString(), []);

  const minArrivalDate = useMemo(() => {
    if (editingRecord?.arrival_date && editingRecord.arrival_date < todayDateString) {
      return editingRecord.arrival_date;
    }
    return todayDateString;
  }, [editingRecord, todayDateString]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [tableError, setTableError] = useState("");
  const [loadingRows, setLoadingRows] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [stepError, setStepError] = useState("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addEntryRequestId]);


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
      toInteger(form.foreigner_count);
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
    // Default country to Philippines (find by name)
    const philippinesId = referenceTables.countries.find(
      (c) => c.name?.toLowerCase().includes("philippine")
    )?.id || "";
    setForm({ ...initialForm, country_id: String(philippinesId) });
    setFormError("");
    setStepError("");
    setCurrentStep(1);
    setIsAddOpen(true);
  }

  function openViewRecord(record) {
    setEditingRecord(record);
    let firstName = record.first_name || "";
    let lastName = record.last_name || "";
    if (!firstName && !lastName && record.full_name) {
      const parts = (record.full_name || "").trim().split(" ");
      lastName = parts.length > 1 ? parts[parts.length - 1] : "";
      firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "";
    }

    const rawContact = record.contact_number || "";
    const contactDigits = rawContact.startsWith("+63")
      ? rawContact.slice(3)
      : rawContact.startsWith("0")
      ? rawContact.slice(1)
      : rawContact;

    setForm({
      first_name: firstName,
      last_name: lastName,
      email: record.email || "",
      contact_number: contactDigits,
      country_id: String(record.country_id || ""),
      region_id: String(record.region_id || ""),
      province_id: String(record.province_id || ""),
      resort_id: String(record.resort_id || ""),
      itinerary_id: String(record.itinerary_id || ""),
      travel_mode_id: String(record.travel_mode_id || ""),
      boat_type_id: String(record.boat_type_id || ""),
      boat_capacity_fare: record.boat_capacity_fare || "",
      visit_purpose_id: String(record.visit_purpose_id || ""),
      arrival_date: record.arrival_date || "",
      filipino_count: String(record.filipino_count || 0),
      foreigner_count: String(record.foreigner_count || 0),
      total_male: String(record.total_male || 0),
      total_female: String(record.total_female || 0),
      special_group_count: String(record.special_group_count || 0),
      age_0_7: String(record.age_0_7 || 0),
      age_8_59: String(record.age_8_59 || 0),
      age_60_above: String(record.age_60_above || 0),
    });

    setFormError("");
    setStepError("");
    setCurrentStep(5);
    setIsAddOpen(true);
  }

  function handleSidebarStepClick(targetStep) {
    if (editingRecord) {
      jumpToStep(targetStep);
      return;
    }
    if (targetStep <= currentStep) {
      jumpToStep(targetStep);
      return;
    }
    const err = validateStep(currentStep);
    if (err) {
      setStepError(err);
      return;
    }
    jumpToStep(targetStep);
  }

  function closeForm() {
    setIsAddOpen(false);
    setEditingRecord(null);
    setForm(initialForm);
    setFormError("");
    setStepError("");
    setCurrentStep(1);
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
    const totalVisitors = filipinoCount + foreignerCount;
    // Store with +63 prefix
    const contactNumber = form.contact_number.trim()
      ? `+63${form.contact_number.trim()}`
      : "";

    return {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      // full_name is sent for backward compatibility (mobile/booking importer)
      full_name: [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(" "),
      email: form.email.trim(),
      consent_confirmed: true,
      contact_number: contactNumber,
      country_id: Number(form.country_id),
      region_id: Number(form.region_id),
      province_id: Number(form.province_id),
      country_of_origin: "",
      resort_id: Number(form.resort_id),
      itinerary_id: Number(form.itinerary_id),
      travel_mode_id: Number(form.travel_mode_id),
      boat_type_id: Number(form.boat_type_id),
      boat_capacity_fare: form.boat_capacity_fare.trim(),
      parking_space: "",
      visit_purpose_id: Number(form.visit_purpose_id),
      arrival_date: form.arrival_date,
      filipino_count: filipinoCount,
      foreigner_count: foreignerCount,
      maubanin_count: 0,
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

  function validateStep(step) {
    switch (step) {
      case 1:
        if (!form.first_name.trim()) return "First Name is required.";
        if (!form.last_name.trim()) return "Last Name is required.";
        if (!form.email.trim()) return "Email is required.";
        if (!form.contact_number.trim()) return "Contact Number is required.";
        if (form.contact_number.trim().length !== 10) return "Contact Number must be exactly 10 digits (after +63).";
        if (!form.country_id) return "Country is required.";
        return "";
      case 2:
        if (!form.region_id) return "Region is required.";
        if (!form.province_id) return "Province is required.";
        if (!form.resort_id) return "Resort is required.";
        if (!form.itinerary_id) return "Travel Itinerary is required.";
        return "";
      case 3:
        if (!form.travel_mode_id) return "Vehicle Classification is required.";
        if (!form.visit_purpose_id) return "Purpose of Travel is required.";
        if (!form.arrival_date) return "Arrival Date is required.";
        if (form.arrival_date < minArrivalDate) {
          return "Arrival Date cannot be in the past. Please select today or a future date.";
        }
        return "";
      case 4: {
        const payload = buildPayload();
        return validateTotals(payload);
      }
      default:
        return "";
    }
  }

  function handleStepContinue() {
    const err = validateStep(currentStep);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError("");
    setCurrentStep((s) => Math.min(5, s + 1));
  }

  function handleStepBack() {
    setStepError("");
    setCurrentStep((s) => Math.max(1, s - 1));
  }

  function jumpToStep(step) {
    setStepError("");
    setCurrentStep(step);
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

    if (payload.maubanin_count > payload.filipino_count) {
      return "Maubanin count cannot be greater than Filipino count.";
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

  async function handleSubmit() {
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
        { refreshComputed: true }
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
      const total = toInteger(current.filipino_count) + toInteger(current.foreigner_count);
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
      const total = toInteger(current.filipino_count) + toInteger(current.foreigner_count);
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
      "First Name",
      "Last Name",
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
      getFirstName(record),
      getLastName(record),
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
          <h1>Record Management</h1>
          <p>Track visitor registrations, verify tourist counts, and manage arrivals</p>
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
                  "First Name",
                  "Last Name",
                  "Contact",
                  "Country",
                  "Pax",
                  "Arrival",
                  "Travel Itinerary",
                  "Resort",
                  "Status",
                  "Actions",
                ].map((header) => (
                  <th key={header} style={header === "Actions" ? { textAlign: "center" } : {}}>{header}</th>
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
                        <p className="booking-guest-name">{getFirstName(row)}</p>
                        <p className="booking-id">{row.survey_id}</p>
                      </td>

                      <td>
                        <p className="booking-guest-name">{getLastName(row)}</p>
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
                            onClick={() => openViewRecord(row)}
                            title="View & Review record"
                            aria-label="View record"
                          >
                            <FiEye/>
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
        <div className="wizard-overlay">
          <div className="wizard-shell">
            {/* ── Sidebar ── */}
            <aside className="wizard-sidebar">
              <p className="wizard-sidebar-title">
                {editingRecord ? "Tourist Record Details & Edit" : "Data Management Add Record"}
              </p>
              {WIZARD_STEPS.map((step, idx) => {
                const stepNum = idx + 1;
                const isCompleted = editingRecord ? true : stepNum < currentStep;
                const isActive = stepNum === currentStep;
                return (
                  <div
                    key={stepNum}
                    className={`wizard-step-item clickable${isCompleted ? " completed" : ""}${isActive ? " active" : ""}`}
                    onClick={() => handleSidebarStepClick(stepNum)}
                    title={`Go to ${step.label}`}
                  >
                    <div className="wizard-step-bubble">
                      {isCompleted && !isActive ? <FiCheck size={12} /> : stepNum}
                    </div>
                    <div className="wizard-step-label">
                      <strong>{step.label}</strong>
                      <small>{step.sub}</small>
                    </div>
                  </div>
                );
              })}
            </aside>

            {/* ── Main ── */}
            <div className="wizard-main">
              <div className="wizard-header">
                <div className="wizard-header-top">
                  <span className="wizard-step-title">
                    Step {currentStep} of 5 &bull; {WIZARD_STEPS[currentStep - 1].label}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span className="wizard-progress-label">
                      {currentStep === 5 ? "100%" : `${Math.round(((currentStep - 1) / 5) * 100)}%`} done
                    </span>
                    <button
                      type="button"
                      className="wizard-close-btn"
                      onClick={closeForm}
                      title="Close"
                      aria-label="Close"
                    >
                      <FiX size={18} />
                    </button>
                  </div>
                </div>
                <div className="wizard-progress-track">
                  <div
                    className="wizard-progress-bar"
                    style={{ width: `${currentStep === 5 ? 100 : Math.round(((currentStep - 1) / 5) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="wizard-body">
                {/* ── Step 1: Tourist Info ── */}
                {currentStep === 1 && (
                  <div className="wizard-grid">
                    <WizardField label="First Name" required>
                      <input
                        type="text"
                        value={form.first_name}
                        placeholder="First name"
                        onChange={(e) => updateField("first_name", e.target.value)}
                      />
                    </WizardField>
                    <WizardField label="Last Name" required>
                      <input
                        type="text"
                        value={form.last_name}
                        placeholder="Last name"
                        onChange={(e) => updateField("last_name", e.target.value)}
                      />
                    </WizardField>
                    <WizardField label="Email" required>
                      <input
                        type="email"
                        value={form.email}
                        placeholder="email@example.com"
                        onChange={(e) => updateField("email", e.target.value)}
                      />
                    </WizardField>
                    <WizardField label="Contact Number" required>
                      <div className="wizard-contact-row">
                        <span className="wizard-contact-prefix">+63</span>
                        <input
                          type="tel"
                          value={form.contact_number}
                          placeholder="9XXXXXXXXX"
                          maxLength={10}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                            updateField("contact_number", digits);
                          }}
                        />
                      </div>
                    </WizardField>
                    <WizardField label="Country" required>
                      <select
                        value={form.country_id}
                        onChange={(e) => updateField("country_id", e.target.value)}
                      >
                        <option value="">Select country</option>
                        {referenceTables.countries.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </WizardField>
                  </div>
                )}

                {/* ── Step 2: Location ── */}
                {currentStep === 2 && (
                  <div className="wizard-grid">
                    <WizardField label="Region" required>
                      <select
                        value={form.region_id}
                        onChange={(e) => updateField("region_id", e.target.value)}
                      >
                        <option value="">Select region</option>
                        {referenceTables.regions.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </WizardField>
                    <WizardField label="Province" required>
                      <select
                        value={form.province_id}
                        onChange={(e) => updateField("province_id", e.target.value)}
                        disabled={!form.region_id}
                      >
                        <option value="">{form.region_id ? "Select province" : "Select region first"}</option>
                        {provinceOptions.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </WizardField>
                    <WizardField label="Resort" required>
                      <select
                        value={form.resort_id}
                        onChange={(e) => updateField("resort_id", e.target.value)}
                      >
                        <option value="">Select resort</option>
                        {referenceTables.resorts.map((r) => (
                          <option key={r.resort_id} value={r.resort_id}>{r.resort_name}</option>
                        ))}
                      </select>
                    </WizardField>
                    <WizardField label="Travel Itinerary" required>
                      <select
                        value={form.itinerary_id}
                        onChange={(e) => updateField("itinerary_id", e.target.value)}
                      >
                        <option value="">Select itinerary</option>
                        {referenceTables.itineraries.map((i) => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                    </WizardField>
                  </div>
                )}

                {/* ── Step 3: Travel Details ── */}
                {currentStep === 3 && (
                  <div className="wizard-grid">
                    <WizardField label="Vehicle Classification" required>
                      <select
                        value={form.travel_mode_id}
                        onChange={(e) => updateField("travel_mode_id", e.target.value)}
                      >
                        <option value="">Select mode</option>
                        {referenceTables.travelModes.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </WizardField>
                    <WizardField label="Boat Classification" required>
                      <select
                        value={form.boat_type_id}
                        onChange={(e) => updateField("boat_type_id", e.target.value)}
                      >
                        <option value="">Select boat</option>
                        {referenceTables.boatTypes.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </WizardField>
                    <WizardField label="Visit Purpose" required>
                      <select
                        value={form.visit_purpose_id}
                        onChange={(e) => updateField("visit_purpose_id", e.target.value)}
                      >
                        <option value="">Select purpose</option>
                        {referenceTables.visitPurposes.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </WizardField>
                    <WizardField label="Arrival Date" required>
                      <input
                        type="date"
                        min={minArrivalDate}
                        value={form.arrival_date}
                        onChange={(e) => updateField("arrival_date", e.target.value)}
                      />
                    </WizardField>
                    <WizardField label="Boat Capacity and Fare">
                      <select
                        value={form.boat_capacity_fare}
                        onChange={(e) => updateField("boat_capacity_fare", e.target.value)}
                      >
                        <option value="">Select capacity and fare</option>
                        {boatCapacityFareOptions.map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </WizardField>
                  </div>
                )}

                {/* ── Step 4: Head Count ── */}
                {currentStep === 4 && (
                  <>
                    <div className="wizard-grid">
                      <WizardField label="Filipino Count" required>
                        <input type="number" min="0" value={form.filipino_count} onChange={(e) => updateField("filipino_count", e.target.value)} />
                      </WizardField>
                      <WizardField label="Foreigner Count" required>
                        <input type="number" min="0" value={form.foreigner_count} onChange={(e) => updateField("foreigner_count", e.target.value)} />
                      </WizardField>
                      <WizardField label="Total Male" required>
                        <input type="number" min="0" value={form.total_male} onChange={(e) => updateField("total_male", e.target.value)} />
                      </WizardField>
                      <WizardField label="Total Female" required>
                        <input type="number" min="0" value={form.total_female} onChange={(e) => updateField("total_female", e.target.value)} />
                      </WizardField>
                      <WizardField label="Age 0-7" required>
                        <input type="number" min="0" value={form.age_0_7} onChange={(e) => updateField("age_0_7", e.target.value)} />
                      </WizardField>
                      <WizardField label="Age 8-59" required>
                        <input type="number" min="0" value={form.age_8_59} onChange={(e) => updateField("age_8_59", e.target.value)} />
                      </WizardField>
                      <WizardField label="Age 60+" required>
                        <input type="number" min="0" value={form.age_60_above} onChange={(e) => updateField("age_60_above", e.target.value)} />
                      </WizardField>
                      <WizardField label="Senior / PWD / 7 below">
                        <input type="number" min="0" value={form.special_group_count} onChange={(e) => updateField("special_group_count", e.target.value)} />
                      </WizardField>
                    </div>
                    <div className="wizard-totals-check">
                      <div className="wizard-total-item">
                        <span>Visitor total</span>
                        <strong className="ok">{formTotals.classification}</strong>
                      </div>
                      <div className="wizard-total-item">
                        <span>Male + Female</span>
                        <strong className={formTotals.genderMatches ? "ok" : "error"}>{formTotals.gender}</strong>
                      </div>
                      <div className="wizard-total-item">
                        <span>Age groups total</span>
                        <strong className={formTotals.agesMatch ? "ok" : "error"}>{formTotals.ages}</strong>
                      </div>
                      <div className="wizard-total-item">
                        <span>Senior/PWD/7 below</span>
                        <strong className={formTotals.specialValid ? "ok" : "error"}>{formTotals.special}</strong>
                      </div>
                    </div>
                    <div className="tourist-auto-fill-row" style={{ marginTop: 8 }}>
                      <button type="button" onClick={fillGenderBalance}>Balance female count</button>
                      <button type="button" onClick={fillAgeBalance}>Balance age 8-59</button>
                    </div>
                  </>
                )}

                {/* ── Step 5: Review ── */}
                {currentStep === 5 && (
                  <>
                    <WizardReviewSection title="Tourist Info" onEdit={() => jumpToStep(1)}>
                      <WizardReviewItem label="Last Name" value={form.last_name || "—"} />
                      <WizardReviewItem label="First Name" value={form.first_name || "—"} />
                      <WizardReviewItem label="Email" value={form.email || "—"} />
                      <WizardReviewItem label="Contact Number" value={form.contact_number || "—"} />
                      <WizardReviewItem label="Country" value={resolveLabel(referenceTables.countries, form.country_id)} />
                    </WizardReviewSection>
                    <WizardReviewSection title="Location" onEdit={() => jumpToStep(2)}>
                      <WizardReviewItem label="Region" value={resolveLabel(referenceTables.regions, form.region_id)} />
                      <WizardReviewItem label="Province" value={resolveLabel(referenceTables.provinces, form.province_id)} />
                      <WizardReviewItem label="Resort" value={resolveLabel(referenceTables.resorts, form.resort_id, "resort_id", "resort_name")} />
                      <WizardReviewItem label="Itinerary" value={resolveLabel(referenceTables.itineraries, form.itinerary_id)} />
                    </WizardReviewSection>
                    <WizardReviewSection title="Travel Details" onEdit={() => jumpToStep(3)}>
                      <WizardReviewItem label="Travel Mode" value={resolveLabel(referenceTables.travelModes, form.travel_mode_id)} />
                      <WizardReviewItem label="Boat Type" value={resolveLabel(referenceTables.boatTypes, form.boat_type_id)} />
                      <WizardReviewItem label="Visit Purpose" value={resolveLabel(referenceTables.visitPurposes, form.visit_purpose_id)} />
                      <WizardReviewItem label="Arrival Date" value={form.arrival_date || "—"} />
                    </WizardReviewSection>
                    <WizardReviewSection title="Head Count" onEdit={() => jumpToStep(4)}>
                      <WizardReviewItem label="Filipino Count" value={form.filipino_count} />
                      <WizardReviewItem label="Foreigner Count" value={form.foreigner_count} />
                      <WizardReviewItem label="Total Male" value={form.total_male} />
                      <WizardReviewItem label="Total Female" value={form.total_female} />
                      <WizardReviewItem label="Age 0-7" value={form.age_0_7} />
                      <WizardReviewItem label="Age 8-59" value={form.age_8_59} />
                      <WizardReviewItem label="Age 60+" value={form.age_60_above} />
                    </WizardReviewSection>
                    {formError && <p className="wizard-step-error">{formError}</p>}
                  </>
                )}

                {stepError && <p className="wizard-step-error">{stepError}</p>}
              </div>

              {/* ── Footer ── */}
              <div className="wizard-footer">
                <span className="wizard-footer-note">Progress saved automatically</span>
                <div className="wizard-footer-actions">
                  {currentStep > 1 && (
                    <button type="button" className="wizard-btn-back" onClick={handleStepBack}>
                      Back
                    </button>
                  )}
                  {currentStep < 5 && (
                    <button type="button" className="wizard-btn-continue" onClick={handleStepContinue}>
                      Continue &rsaquo;
                    </button>
                  )}
                  {editingRecord && currentStep < 5 && (
                    <button
                      type="button"
                      className="wizard-btn-back"
                      style={{ color: "#16a34a", fontWeight: "600" }}
                      onClick={() => jumpToStep(5)}
                      title="Return to Review"
                    >
                      Review &rsaquo;
                    </button>
                  )}
                  {currentStep === 1 && !editingRecord && (
                    <button type="button" className="wizard-btn-back" onClick={closeForm}>
                      Cancel
                    </button>
                  )}
                  {currentStep === 5 && (
                    <>
                      <button type="button" className="wizard-btn-back" onClick={closeForm}>
                        Close
                      </button>
                      <button
                        type="button"
                        className="wizard-btn-save"
                        disabled={saving}
                        onClick={handleSubmit}
                      >
                        {saving ? "Saving..." : editingRecord ? "✓ Update Record" : "✓ Save Record"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
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

function WizardField({ label, required, children }) {
  return (
    <div className="wizard-field">
      <label>
        {label}{required && <span className="req"> *</span>}
      </label>
      {children}
    </div>
  );
}

function WizardReviewSection({ title, onEdit, children }) {
  return (
    <div className="wizard-review-section">
      <div className="wizard-review-section-header">
        <h4>{title}</h4>
        <button type="button" className="wizard-review-edit-btn" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className="wizard-review-grid">{children}</div>
    </div>
  );
}

function WizardReviewItem({ label, value }) {
  return (
    <div className="wizard-review-item">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

export default BookingManagement;
