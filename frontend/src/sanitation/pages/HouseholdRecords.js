import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiAlertTriangle,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiDroplet,
  FiEdit2,
  FiEye,
  FiFilter,
  FiHome,
  FiMapPin,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiShield,
  FiX,
} from "react-icons/fi";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
import { useSanitationData } from "../context/SanitationDataContext";

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

function toTitleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function printHouseholdProfile(record) {
  if (!record) return;

  const printedAt = new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(new Date());

  const printWindow = window.open("", "_blank", "width=750,height=850");
  if (!printWindow) return;

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Household Sanitation Survey Profile - ${record.household_code}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; line-height: 1.4; }
          .header { text-align: center; border-bottom: 2px solid #047857; padding-bottom: 12px; margin-bottom: 20px; }
          .header p { margin: 2px 0; font-size: 12px; color: #475569; }
          .header h1 { margin: 4px 0 2px; font-size: 19px; text-transform: uppercase; color: #065f46; letter-spacing: 0.5px; }
          .header h2 { margin: 2px 0 0; font-size: 13px; font-weight: 700; color: #1e293b; }
          .title-strip { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px 14px; border-radius: 6px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
          .title-strip strong { font-size: 15px; color: #065f46; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
          .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #fafafa; }
          .box span { display: block; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
          .box strong { font-size: 13px; color: #0f172a; }
          .section { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
          .section h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px; }
          .sig-line { border-top: 1px solid #0f172a; text-align: center; padding-top: 6px; font-size: 12px; }
          .sig-line small { display: block; font-size: 10px; color: #64748b; margin-top: 2px; }
          @media print { body { margin: 16px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <p>Republic of the Philippines • Province of Quezon</p>
          <h1>Municipality of Mauban</h1>
          <h2>Municipal Health Office — Sanitation Section</h2>
          <p style="margin-top: 4px; font-size: 11px;">Document Generated: ${printedAt}</p>
        </div>

        <div class="title-strip">
          <strong>HOUSEHOLD ENVIRONMENTAL SANITATION & WATER PROFILE</strong>
          <span>ID: ${record.household_code || "N/A"}</span>
        </div>

        <div class="grid">
          <div class="box">
            <span>Household Head</span>
            <strong>${record.household_head}</strong>
          </div>
          <div class="box">
            <span>Barangay & Address</span>
            <strong>Brgy. ${record.barangay} ${record.address ? "• " + record.address : ""}</strong>
          </div>
          <div class="box">
            <span>Total Family Members</span>
            <strong>${record.total_members} (Male: ${record.male_count}, Female: ${record.female_count})</strong>
          </div>
          <div class="box">
            <span>Toilet Facility (ZOD Standard)</span>
            <strong>${record.toilet_type_label || record.toilet_type}</strong>
          </div>
          <div class="box">
            <span>Water Access Level</span>
            <strong>${record.water_level_label || record.water_level}</strong>
          </div>
          <div class="box">
            <span>Water Sources</span>
            <strong>${record.water_source || "None recorded"}</strong>
          </div>
          <div class="box">
            <span>Waste Disposal System</span>
            <strong>${record.waste_disposal_label || record.waste_disposal}</strong>
          </div>
          <div class="box">
            <span>Compliance Classification</span>
            <strong>${record.status_label || record.status}</strong>
          </div>
        </div>

        <div class="section">
          <h3>Sanitary Inspector Survey & Assessment Remarks</h3>
          <p>${record.remarks || "Standard residential sanitation survey profile recorded under DOH and LGU Mauban Zero Open Defecation guidelines."}</p>
        </div>

        <div class="signatures">
          <div class="sig-line">
            <strong>Sanitary Inspector / Barangay Health Worker</strong>
            <small>Field Surveyor</small>
          </div>
          <div class="sig-line">
            <strong>Municipal Health Officer (MHO)</strong>
            <small>Attested & Verified</small>
          </div>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
}

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "good_standing", label: "Good Standing" },
  { value: "for_completion", label: "For Compliance" },
  { value: "violation", label: "Needs Assistance" },
];

const toiletOptions = [
  { value: "water_sealed", label: "Water-Sealed" },
  { value: "pour_flush", label: "Pour Flush" },
  { value: "pit_latrine", label: "Pit Latrine" },
  { value: "none", label: "None" },
];

const waterLevelOptions = [
  { value: "level_1", label: "Level I" },
  { value: "level_2", label: "Level II" },
  { value: "level_3", label: "Level III" },
];

// Water source options with their auto-assigned level
const WATER_SOURCE_OPTIONS = [
  { value: "MWSS", label: "MWSS", sublabel: "Municipal Water Supply System", level: "level_3" },
  { value: "Level II (Communal Faucet)", label: "Level II (Communal Faucet)", sublabel: "Shared piped water", level: "level_2" },
  { value: "Deep Well", label: "Deep Well", sublabel: "Private or shared deep well", level: "level_1" },
  { value: "Spring", label: "Spring", sublabel: "Natural spring source", level: "level_1" },
  { value: "Rainwater", label: "Rainwater", sublabel: "Collected rainwater", level: "level_1" },
  { value: "Others", label: "Others", sublabel: "Other water sources", level: "level_1" },
];

function computeWaterLevel(sources = []) {
  if (!sources.length) return "";
  const levels = sources.map((s) => {
    const opt = WATER_SOURCE_OPTIONS.find((o) => o.value === s);
    return opt?.level || "level_1";
  });
  if (levels.includes("level_3")) return "level_3";
  if (levels.includes("level_2")) return "level_2";
  return "level_1";
}

const wasteOptions = [
  { value: "collected", label: "Collected by LGU" },
  { value: "composted", label: "Composted" },
  { value: "burned", label: "Burned" },
  { value: "dumped", label: "Dumped" },
];

const statusFormOptions = [
  { value: "good_standing", label: "Good Standing" },
  { value: "for_completion", label: "For Compliance" },
  { value: "violation", label: "Needs Assistance" },
];

const emptyForm = {
  first_name: "",
  last_name: "",
  household_head: "",
  barangay: "",
  address: "",
  male_count: 0,
  female_count: 0,
  toilet_type: "none",
  water_level: "",
  water_source: [],
  waste_disposal: "collected",
  status: "good_standing",
  last_survey_date: new Date().toISOString().slice(0, 10),
  remarks: "",
};

function HouseholdRecords() {
  const navigate = useNavigate();
  const { barangays, householdRecords, householdDashboardData, loading, error, createHousehold, updateHousehold } =
    useSanitationData();

  const [barangayFilter, setBarangayFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Modal states
  const [viewRecord, setViewRecord] = useState(null);
  const [editRecord, setEditRecord] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const barangayOptions = useMemo(() => {
    const officialBarangays = (barangays || [])
      .map((item) => item.name || item)
      .filter(Boolean);
    const set = new Set([
      ...OFFICIAL_MAUBAN_BARANGAYS,
      ...officialBarangays,
      ...householdRecords.map((item) => item.barangay).filter(Boolean),
    ]);
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
    return ["all", ...sorted];
  }, [barangays, householdRecords]);

  const barangayRecords = useMemo(() => {
    if (barangayFilter === "all") {
      return householdRecords;
    }

    return householdRecords.filter((item) => item.barangay === barangayFilter);
  }, [householdRecords, barangayFilter]);

  const summary = useMemo(() => {
    const total = barangayRecords.length;
    const withSanitaryFacility = barangayRecords.filter(
      (item) => item.toilet_type && item.toilet_type !== "none"
    ).length;
    const withWaterAccess = barangayRecords.filter((item) =>
      ["level_2", "level_3"].includes(item.water_level)
    ).length;
    const atRiskHouseholds = barangayRecords.filter(
      (item) => item.status === "violation"
    ).length;

    // Fallback to pre-aggregated dashboard data if "all" is active and records aren't loaded yet
    if (barangayFilter === "all" && householdDashboardData?.summary && !total) {
      return householdDashboardData.summary;
    }

    return {
      totalHouseholds: total,
      withSanitaryFacility,
      sanitaryFacilityCoverage: total
        ? Math.round((withSanitaryFacility / total) * 100)
        : 0,
      withWaterAccess,
      waterAccessCoverage: total
        ? Math.round((withWaterAccess / total) * 100)
        : 0,
      atRiskHouseholds,
    };
  }, [barangayFilter, householdDashboardData, barangayRecords]);

  const riskByBarangay = useMemo(() => {
    if (barangayFilter !== "all") {
      const atRisk = barangayRecords.filter(
        (item) => item.status === "violation"
      ).length;
      const forCompletion = barangayRecords.filter(
        (item) => item.status === "for_completion"
      ).length;
      const goodStanding = barangayRecords.filter(
        (item) => item.status === "good_standing"
      ).length;
      return [
        {
          barangay: barangayFilter,
          total: barangayRecords.length,
          atRisk,
          forCompletion,
          goodStanding,
        },
      ];
    }
    let globalRisk = householdDashboardData?.riskByBarangay || [];
    // Filter out barangays with 0 risk and sort descending
    return globalRisk
      .filter((item) => item.atRisk > 0)
      .sort((a, b) => b.atRisk - a.atRisk);
  }, [householdDashboardData, barangayFilter, barangayRecords]);

  const toiletDistribution = useMemo(() => {
    let waterSealed = 0;
    let pourFlush = 0;
    let pitLatrine = 0;
    let none = 0;

    barangayRecords.forEach((item) => {
      if (item.toilet_type === "water_sealed") waterSealed++;
      else if (item.toilet_type === "pour_flush") pourFlush++;
      else if (item.toilet_type === "pit_latrine") pitLatrine++;
      else if (item.toilet_type === "none") none++;
    });

    return { waterSealed, pourFlush, pitLatrine, none };
  }, [barangayRecords]);

  const wasteDistribution = useMemo(() => {
    let collected = 0;
    let composted = 0;
    let burned = 0;
    let dumped = 0;

    barangayRecords.forEach((item) => {
      if (item.waste_disposal === "collected") collected++;
      else if (item.waste_disposal === "composted") composted++;
      else if (item.waste_disposal === "burned") burned++;
      else if (item.waste_disposal === "dumped") dumped++;
    });

    return { collected, composted, burned, dumped };
  }, [barangayRecords]);

  const waterDistribution = useMemo(() => {
    let level1 = 0;
    let level2 = 0;
    let level3 = 0;

    barangayRecords.forEach((item) => {
      if (item.water_level === "level_1") level1++;
      else if (item.water_level === "level_2") level2++;
      else if (item.water_level === "level_3") level3++;
    });

    return { level1, level2, level3 };
  }, [barangayRecords]);

  const filteredHouseholds = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return barangayRecords
      .filter((item) => {
        const searchText = [
          item.household_code,
          item.household_head,
          item.barangay,
          item.address,
          item.toilet_type_label,
          item.water_level_label,
          item.water_source,
          item.waste_disposal_label,
          item.status_label,
        ]
          .join(" ")
          .toLowerCase();

        const matchesSearch = searchText.includes(keyword);
        const matchesStatus =
          statusFilter === "all" || item.status === statusFilter;

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }, [barangayRecords, search, statusFilter]);

  const highestRiskBarangay = useMemo(() => {
    const rowsWithRisk = riskByBarangay.filter((item) => item.atRisk > 0);

    if (!rowsWithRisk.length) {
      return null;
    }

    return [...rowsWithRisk].sort((a, b) => b.atRisk - a.atRisk)[0];
  }, [riskByBarangay]);

  const maxRiskValue = Math.max(
    ...riskByBarangay.map((item) => item.atRisk || 0),
    1
  );

  const maxToiletValue = Math.max(
    toiletDistribution.waterSealed || 0,
    toiletDistribution.pourFlush || 0,
    toiletDistribution.pitLatrine || 0,
    toiletDistribution.none || 0,
    1
  );

  const maxWasteValue = Math.max(
    wasteDistribution.collected || 0,
    wasteDistribution.composted || 0,
    wasteDistribution.burned || 0,
    wasteDistribution.dumped || 0,
    1
  );

  function handleExport() {
    const headers = [
      "Household Code",
      "Household Head",
      "Barangay",
      "Address",
      "Male Count",
      "Female Count",
      "Total Members",
      "Toilet Type",
      "Water Level",
      "Water Source",
      "Waste Disposal",
      "Status",
      "Last Survey Date",
      "Remarks",
    ];
    const rows = filteredHouseholds.map((item) => [
      item.household_code,
      item.household_head,
      item.barangay,
      item.address,
      item.male_count,
      item.female_count,
      item.total_members,
      item.toilet_type_label,
      item.water_level_label,
      item.water_source,
      item.waste_disposal_label,
      item.status_label,
      item.last_survey_date,
      item.remarks,
    ]);

    exportCsv(datedCsvFilename("household-records"), headers, rows);
  }

  function openAdd() {
    setForm(emptyForm);
    setFormError("");
    setIsAddOpen(true);
  }

  function openEdit(record) {
    const sourcesArray = record.water_source
      ? record.water_source.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    let firstName = "";
    let lastName = "";
    if (record.household_head) {
      if (record.household_head.includes(",")) {
        const parts = record.household_head.split(",");
        lastName = parts[0].trim();
        firstName = parts[1].trim();
      } else {
        const parts = record.household_head.trim().split(" ");
        if (parts.length > 1) {
          lastName = parts.pop();
          firstName = parts.join(" ");
        } else {
          firstName = record.household_head;
        }
      }
    }

    setForm({
      first_name: firstName,
      last_name: lastName,
      household_head: record.household_head || "",
      barangay: record.barangay || "",
      address: record.address || "",
      male_count: record.male_count ?? 0,
      female_count: record.female_count ?? 0,
      toilet_type: record.toilet_type || "none",
      water_level: record.water_level || "",
      water_source: sourcesArray,
      waste_disposal: record.waste_disposal || "collected",
      status: record.status || "good_standing",
      last_survey_date: record.last_survey_date || "",
      remarks: record.remarks || "",
    });
    setFormError("");
    setEditRecord(record);
  }

  function closeModals() {
    setIsAddOpen(false);
    setEditRecord(null);
    setViewRecord(null);
    setFormError("");
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSaveAdd() {
    let finalHead = form.household_head.trim();
    if (form.last_name.trim() && form.first_name.trim()) {
      finalHead = `${form.last_name.trim()}, ${form.first_name.trim()}`;
    } else if (form.last_name.trim() || form.first_name.trim()) {
      finalHead = (form.last_name.trim() + " " + form.first_name.trim()).trim();
    }

    if (!finalHead) {
      setFormError("Household Head Last name or First name is required.");
      return;
    }
    if (!form.barangay.trim()) {
      setFormError("Barangay is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const sourcesArray = Array.isArray(form.water_source) ? form.water_source : [];
      const waterLevel = computeWaterLevel(sourcesArray);
      await createHousehold({
        ...form,
        household_head: finalHead,
        water_source: sourcesArray.join(", "),
        water_level: waterLevel || form.water_level,
        male_count: Number(form.male_count) || 0,
        female_count: Number(form.female_count) || 0,
        last_survey_date: form.last_survey_date || null,
      });
      closeModals();
    } catch (err) {
      setFormError(err?.message || "Failed to save household record.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    let finalHead = form.household_head.trim();
    if (form.last_name.trim() && form.first_name.trim()) {
      finalHead = `${form.last_name.trim()}, ${form.first_name.trim()}`;
    } else if (form.last_name.trim() || form.first_name.trim()) {
      finalHead = (form.last_name.trim() + " " + form.first_name.trim()).trim();
    }

    if (!finalHead) {
      setFormError("Household Head is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const sourcesArray = Array.isArray(form.water_source) ? form.water_source : [];
      const waterLevel = computeWaterLevel(sourcesArray);
      await updateHousehold(editRecord.id, {
        ...form,
        household_head: finalHead,
        water_source: sourcesArray.join(", "),
        water_level: waterLevel || form.water_level,
        male_count: Number(form.male_count) || 0,
        female_count: Number(form.female_count) || 0,
        last_survey_date: form.last_survey_date || null,
      });
      closeModals();
    } catch (err) {
      setFormError(err?.message || "Failed to update household record.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="household-page">Loading household records...</div>;
  }

  return (
    <div className="household-page">
      <div className="household-header sanitation-split-header">
        <div>
          <h1>Household Records</h1>
          <p>Monitor household sanitation profiles and risk indicators</p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="sanitation-export-btn"
            onClick={handleExport}
          >
            <FiDownload /> Export CSV
          </button>
          <button
            type="button"
            className="sanitation-export-btn"
            style={{ background: "#16a34a", color: "white", borderColor: "#16a34a" }}
            onClick={openAdd}
          >
            <FiPlus /> Add Household
          </button>
        </div>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      {/* ── Barangay Filter Selector Toolbar ── */}
      <div className="household-barangay-filter-bar">
        <div className="hh-filter-left">
          <label htmlFor="hh-top-barangay-select">
            <FiFilter /> Filter by Barangay:
          </label>
          <select
            id="hh-top-barangay-select"
            value={barangayFilter}
            onChange={(event) => setBarangayFilter(event.target.value)}
          >
            {barangayOptions.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay === "all"
                  ? "All Mauban Barangays (Municipal Total)"
                  : `Brgy. ${barangay}`}
              </option>
            ))}
          </select>
        </div>

        {barangayFilter !== "all" ? (
          <div className="hh-filter-badge">
            <FiMapPin /> Showing data strictly for <strong>Brgy. {barangayFilter}</strong> ({barangayRecords.length} households)
          </div>
        ) : (
          <div className="hh-filter-badge municipal">
            <FiShield /> Showing consolidated data across <strong>{barangayOptions.length > 1 ? barangayOptions.length - 1 : 0} Barangays</strong> ({householdRecords.length} total households)
          </div>
        )}
      </div>

      <div className="household-stat-grid">
        <HouseholdStat
          title={barangayFilter !== "all" ? `Total Households (Brgy. ${barangayFilter})` : "Total Households"}
          value={summary.totalHouseholds || 0}
          icon={<FiHome />}
          color="green"
        />

        <HouseholdStat
          title={barangayFilter !== "all" ? `With Sanitary Facility (Brgy. ${barangayFilter})` : "With Sanitary Facility"}
          value={summary.withSanitaryFacility || 0}
          desc={`${summary.sanitaryFacilityCoverage || 0}% coverage`}
          icon={<FiHome />}
          color="dark"
        />

        <HouseholdStat
          title={barangayFilter !== "all" ? `With Water Access (Brgy. ${barangayFilter})` : "With Water Access"}
          value={summary.withWaterAccess || 0}
          desc={`${summary.waterAccessCoverage || 0}% level II & III`}
          icon={<FiDroplet />}
          color="blue"
        />

        <HouseholdStat
          title={barangayFilter !== "all" ? `At-Risk Households (Brgy. ${barangayFilter})` : "At-Risk Households"}
          value={summary.atRiskHouseholds || 0}
          icon={<FiAlertTriangle />}
          color="red"
        />
      </div>

      <div className="household-chart-grid">
        <section className="household-chart-card">
          <div className="household-chart-title">
            <div>
              <h3>High Risk Households {barangayFilter !== "all" ? `(Brgy. ${barangayFilter})` : "by Barangay"}</h3>
              <p>{barangayFilter !== "all" ? `Brgy. ${barangayFilter} - Needs Assistance status` : "Across all barangays - Needs Assistance status"}</p>
            </div>

            {highestRiskBarangay ? (
              <div className="risk-badge">
                <span>Priority Area</span>
                <strong>Brgy. {highestRiskBarangay.barangay}</strong>
                <small>
                  {highestRiskBarangay.atRisk} of {summary.totalHouseholds || 0}
                </small>
              </div>
            ) : null}
          </div>

          <div className="risk-bar-list">
            {riskByBarangay.length ? (
              riskByBarangay.map((item) => (
                <div className="risk-row" key={item.barangay}>
                  <span>{item.barangay}</span>

                  <div className="risk-track">
                    <b
                      className={item.atRisk > 0 ? "red" : ""}
                      style={{
                        width:
                          item.atRisk > 0
                            ? `${Math.max(
                                8,
                                Math.round((item.atRisk / maxRiskValue) * 100)
                              )}%`
                            : "0%",
                      }}
                    />
                  </div>

                  <strong>{item.atRisk}</strong>
                </div>
              ))
            ) : (
              <p className="household-empty-text">No barangay risk data found.</p>
            )}
          </div>
        </section>

        <section className="household-chart-card">
          <div className="household-chart-title">
            <div>
              <h3>Toilet Type Distribution {barangayFilter !== "all" ? `(Brgy. ${barangayFilter})` : ""}</h3>
              <p>
                {summary.totalHouseholds || 0} households
                {barangayFilter !== "all" ? ` in Brgy. ${barangayFilter}` : ""}
              </p>
            </div>
          </div>

          <div className="household-bar-chart">
            <div className="household-y-axis">
              <span>{maxToiletValue}</span>
              <span>{Math.round(maxToiletValue * 0.75)}</span>
              <span>{Math.round(maxToiletValue * 0.5)}</span>
              <span>{Math.round(maxToiletValue * 0.25)}</span>
              <span>0</span>
            </div>
            <MockBar
              label="Water-Sealed"
              value={toiletDistribution.waterSealed || 0}
              maxValue={maxToiletValue}
              color="green"
            />
            <MockBar
              label="Pour-Flush"
              value={toiletDistribution.pourFlush || 0}
              maxValue={maxToiletValue}
              color="dark"
            />
            <MockBar
              label="Pit Latrine"
              value={toiletDistribution.pitLatrine || 0}
              maxValue={maxToiletValue}
              color="yellow"
            />
            <MockBar
              label="None / OD"
              value={toiletDistribution.none || 0}
              maxValue={maxToiletValue}
              color="red"
            />
          </div>
        </section>

        <section className="household-chart-card">
          <div className="household-chart-title">
            <div>
              <h3>Waste Disposal Methods {barangayFilter !== "all" ? `(Brgy. ${barangayFilter})` : ""}</h3>
              <p>
                {summary.totalHouseholds || 0} households
                {barangayFilter !== "all" ? ` in Brgy. ${barangayFilter}` : ""}
              </p>
            </div>
          </div>

          <div className="household-bar-chart">
            <div className="household-y-axis">
              <span>{maxWasteValue}</span>
              <span>{Math.round(maxWasteValue * 0.75)}</span>
              <span>{Math.round(maxWasteValue * 0.5)}</span>
              <span>{Math.round(maxWasteValue * 0.25)}</span>
              <span>0</span>
            </div>
            <MockBar
              label="Collected"
              value={wasteDistribution.collected || 0}
              maxValue={maxWasteValue}
              color="green"
            />
            <MockBar
              label="Composted"
              value={wasteDistribution.composted || 0}
              maxValue={maxWasteValue}
              color="dark"
            />
            <MockBar
              label="Burned"
              value={wasteDistribution.burned || 0}
              maxValue={maxWasteValue}
              color="yellow"
            />
            <MockBar
              label="Dumped"
              value={wasteDistribution.dumped || 0}
              maxValue={maxWasteValue}
              color="red"
            />
          </div>
        </section>

        <section className="household-chart-card">
          <div className="household-chart-title">
            <div>
              <h3>Water Access Levels {barangayFilter !== "all" ? `(Brgy. ${barangayFilter})` : ""}</h3>
              <p>
                {summary.totalHouseholds || 0} total households
                {barangayFilter !== "all" ? ` in Brgy. ${barangayFilter}` : ""}
              </p>
            </div>
          </div>

          <div className="water-donut-wrap">
            <div
              className="water-donut"
              style={{
                background: buildWaterGradient(waterDistribution),
              }}
            />
            <div className="water-donut-center-stat">
              <strong>{summary.totalHouseholds || 0}</strong>
              <small>Households</small>
            </div>
          </div>

          <div className="household-legend">
            <div className="legend-item yellow">
              <span className="legend-dot" />
              <span>Level I ({waterDistribution.level1 || 0})</span>
            </div>
            <div className="legend-item green">
              <span className="legend-dot" />
              <span>Level II ({waterDistribution.level2 || 0})</span>
            </div>
            <div className="legend-item dark">
              <span className="legend-dot" />
              <span>Level III ({waterDistribution.level3 || 0})</span>
            </div>
          </div>
        </section>
      </div>

      <section className="household-table-card">
        <div className="household-table-tools">
          <select
            value={barangayFilter}
            onChange={(event) => setBarangayFilter(event.target.value)}
          >
            {barangayOptions.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay === "all"
                  ? "All Mauban Barangays (Municipal Total)"
                  : `Brgy. ${barangay}`}
              </option>
            ))}
          </select>

          <div className="household-right-tools">
            <div className="household-search">
              <FiSearch />
              <input
                placeholder="Search households..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="household-table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Household Head</th>
                <th>Members</th>
                <th>Toilet Type</th>
                <th>Water Source</th>
                <th>Waste Disposal</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredHouseholds.length ? (
                filteredHouseholds.map((row) => (
                  <tr key={row.id}>
                    <td>{row.household_code}</td>

                    <td>
                      <strong>{row.household_head}</strong>
                      <small>{row.barangay}</small>
                    </td>

                    <td>{row.total_members}</td>
                    <td>{row.toilet_type_label}</td>
                    <td>
                      {row.water_level_label}
                      {row.water_source ? ` (${row.water_source})` : ""}
                    </td>
                    <td>{row.waste_disposal_label}</td>
                    <td>
                      <span
                        className={`status-pill ${statusClass(
                          row.status || row.status_label
                        )}`}
                      >
                        {formatHouseholdStatus(row.status || row.status_label)}
                      </span>
                    </td>
                    <td>
                      <div className="establishment-action-buttons">
                        <button
                          type="button"
                          className="establishment-icon-btn locate"
                          title="Locate on GIS Map"
                          onClick={() =>
                            navigate("/sanitation/gis-map", {
                              state: { mode: "households", reportId: row.id },
                            })
                          }
                        >
                          <FiMapPin />
                        </button>
                        <button
                          type="button"
                          className="establishment-icon-btn view"
                          title="View Household Details"
                          onClick={() => setViewRecord(row)}
                        >
                          <FiEye />
                        </button>
                        <button
                          type="button"
                          className="establishment-icon-btn edit"
                          title="Edit Household Record"
                          onClick={() => openEdit(row)}
                        >
                          <FiEdit2 />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="household-empty">
                    No household records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="household-pagination">
          <span>
            Showing {filteredHouseholds.length} of {barangayRecords.length}
          </span>

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

      {/* ── VIEW MODAL ── */}
      {viewRecord && (
        <div className="hh-modal-overlay" onClick={closeModals}>
          <div className="hh-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hh-modal-header">
              <div>
                <h2>{viewRecord.household_head}</h2>
                <span className={`status-pill ${statusClass(viewRecord.status || viewRecord.status_label)}`}>
                  {formatHouseholdStatus(viewRecord.status || viewRecord.status_label)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  className="hh-modal-close"
                  style={{ color: "#065f46" }}
                  onClick={() => printHouseholdProfile(viewRecord)}
                  title="Print Household Sanitation Profile Slip"
                >
                  <FiPrinter />
                </button>
                <button type="button" className="hh-modal-close" onClick={closeModals}>
                  <FiX />
                </button>
              </div>
            </div>

            <div className="hh-modal-body">
              <div className="hh-detail-grid">
                <HHDetailItem label="Household Code" value={viewRecord.household_code} />
                <HHDetailItem label="Barangay" value={viewRecord.barangay} />
                <HHDetailItem label="Address" value={viewRecord.address || "—"} />
                <HHDetailItem label="Male Members" value={viewRecord.male_count} />
                <HHDetailItem label="Female Members" value={viewRecord.female_count} />
                <HHDetailItem label="Total Members" value={viewRecord.total_members} />
                <HHDetailItem label="Toilet Type" value={viewRecord.toilet_type_label} />
                <HHDetailItem label="Water Level" value={viewRecord.water_level_label} />
                <HHDetailItem label="Water Source" value={viewRecord.water_source || "—"} />
                <HHDetailItem label="Waste Disposal" value={viewRecord.waste_disposal_label} />
                <HHDetailItem label="Last Survey Date" value={viewRecord.last_survey_date || "—"} />
                <HHDetailItem label="Remarks" value={viewRecord.remarks || "—"} fullWidth />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD MODAL ── */}
      {isAddOpen && (
        <div className="hh-modal-overlay" onClick={closeModals}>
          <div className="hh-modal hh-modal-form" onClick={(e) => e.stopPropagation()}>
            <div className="hh-modal-header">
              <div>
                <h2>Add Household Record</h2>
                <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
                  Sanitation and water access profile for the household survey.
                </p>
              </div>
              <button type="button" className="hh-modal-close" onClick={closeModals}>
                <FiX />
              </button>
            </div>

            <div className="hh-modal-body">
              <HouseholdForm
                form={form}
                updateField={updateField}
                formError={formError}
              />
            </div>

            <div className="hh-modal-footer">
              <button type="button" className="hh-btn-cancel" onClick={closeModals} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="hh-btn-save" onClick={handleSaveAdd} disabled={saving}>
                {saving ? "Saving..." : "Save Household"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editRecord && (
        <div className="hh-modal-overlay" onClick={closeModals}>
          <div className="hh-modal hh-modal-form" onClick={(e) => e.stopPropagation()}>
            <div className="hh-modal-header">
              <div>
                <h2>Edit Household</h2>
                <small style={{ color: "#6b7280" }}>{editRecord.household_code}</small>
              </div>
              <button type="button" className="hh-modal-close" onClick={closeModals}>
                <FiX />
              </button>
            </div>

            <div className="hh-modal-body">
              <HouseholdForm
                form={form}
                updateField={updateField}
                formError={formError}
              />
            </div>

            <div className="hh-modal-footer">
              <button type="button" className="hh-btn-cancel" onClick={closeModals} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="hh-btn-save" onClick={handleSaveEdit} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Reusable form matching groupmate's exact UI design ── */
function HouseholdForm({ form, updateField, formError }) {
  return (
    <div className="hh-form-grid">
      {formError && <p className="hh-form-error">{formError}</p>}

      {/* Row 1: Household Head Last Name & First Name */}
      <div className="hh-form-group">
        <label>Household Head Last name *</label>
        <input
          type="text"
          value={form.last_name}
          onChange={(e) => {
            const val = toTitleCase(e.target.value);
            updateField("last_name", val);
            updateField(
              "household_head",
              form.first_name ? `${val}, ${form.first_name}` : val
            );
          }}
          placeholder="Last name"
        />
      </div>

      <div className="hh-form-group">
        <label>Household Head First name *</label>
        <input
          type="text"
          value={form.first_name}
          onChange={(e) => {
            const val = toTitleCase(e.target.value);
            updateField("first_name", val);
            updateField(
              "household_head",
              form.last_name ? `${form.last_name}, ${val}` : val
            );
          }}
          placeholder="First name"
        />
      </div>

      {/* Row 2: Barangay & Address */}
      <div className="hh-form-group">
        <label>Barangay *</label>
        <select
          value={form.barangay}
          onChange={(e) => updateField("barangay", e.target.value)}
        >
          <option value="">Select barangay...</option>
          {OFFICIAL_MAUBAN_BARANGAYS.map((bgy) => (
            <option key={bgy} value={bgy}>
              {bgy}
            </option>
          ))}
        </select>
      </div>

      <div className="hh-form-group">
        <label>Address *</label>
        <input
          type="text"
          value={form.address}
          onChange={(e) => updateField("address", toTitleCase(e.target.value))}
          placeholder="House no., Street, sitio"
        />
      </div>

      {/* Row 3: Male & Female Members */}
      <div className="hh-form-group">
        <label>Male Members *</label>
        <input
          type="number"
          min="0"
          value={form.male_count}
          onChange={(e) => updateField("male_count", parseInt(e.target.value, 10) || 0)}
        />
      </div>

      <div className="hh-form-group">
        <label>Female Members *</label>
        <input
          type="number"
          min="0"
          value={form.female_count}
          onChange={(e) => updateField("female_count", parseInt(e.target.value, 10) || 0)}
        />
      </div>

      {/* Row 4: Toilet Type & Waste Disposal */}
      <div className="hh-form-group">
        <label>Toilet Type *</label>
        <select
          value={form.toilet_type}
          onChange={(e) => updateField("toilet_type", e.target.value)}
        >
          {toiletOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="hh-form-group">
        <label>Waste Disposal*</label>
        <select
          value={form.waste_disposal}
          onChange={(e) => updateField("waste_disposal", e.target.value)}
        >
          {wasteOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Row 5: Water Source Multi-select */}
      <div className="hh-form-group hh-full">
        <label>Water Source *</label>
        <WaterSourceMultiSelect
          selected={Array.isArray(form.water_source) ? form.water_source : []}
          onChange={(sources) => updateField("water_source", sources)}
        />
        <small style={{ color: "#6b7280", marginTop: "4px", display: "block" }}>
          Choose one or more source - the water level is assigned automatically.
        </small>
      </div>

      {/* Row 6: Water Level Display */}
      <div className="hh-form-group hh-full">
        <label>Water Level (auto-assigned)</label>
        {(() => {
          const sources = Array.isArray(form.water_source) ? form.water_source : [];
          const level = computeWaterLevel(sources);
          const levelLabel = waterLevelOptions.find((o) => o.value === level)?.label;
          return (
            <div className={`ws-water-level-display${level ? " assigned" : ""}`}>
              {level ? levelLabel : "Select a water source to assign a level"}
            </div>
          );
        })()}
      </div>

      {/* Row 7: Survey Date & Status */}
      <div className="hh-form-group">
        <label>Survey Date</label>
        <input
          type="date"
          value={form.last_survey_date}
          onChange={(e) => updateField("last_survey_date", e.target.value)}
        />
      </div>

      <div className="hh-form-group">
        <label>Status</label>
        <select
          value={form.status}
          onChange={(e) => updateField("status", e.target.value)}
        >
          {statusFormOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Row 8: Remarks */}
      <div className="hh-form-group hh-full">
        <label>Remarks</label>
        <textarea
          rows={4}
          value={form.remarks}
          onChange={(e) => updateField("remarks", e.target.value)}
          placeholder="Additional notes..."
        />
      </div>
    </div>
  );
}

function WaterSourceMultiSelect({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function toggle(value) {
    if (selected.includes(value)) {
      onChange(selected.filter((s) => s !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const label = selected.length
    ? selected.join(", ")
    : null;

  return (
    <div className="ws-multiselect" ref={ref}>
      <button
        type="button"
        className={`ws-multiselect-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={label ? undefined : "placeholder"}>
          {label || "Select water source(s)...."}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d={open ? "M2 8l4-4 4 4" : "M2 4l4 4 4-4"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="ws-dropdown">
          {WATER_SOURCE_OPTIONS.map((opt) => (
            <label key={opt.value} className="ws-option">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              <div className="ws-option-label">
                <span>{opt.label}</span>
                <small>{opt.sublabel}</small>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function HHDetailItem({ label, value, fullWidth }) {
  return (
    <div className={`hh-detail-item${fullWidth ? " hh-full" : ""}`}>
      <span className="hh-detail-label">{label}</span>
      <span className="hh-detail-value">{value}</span>
    </div>
  );
}

function HouseholdStat({ title, value, desc, icon, color }) {
  return (
    <div className="household-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
        {desc ? <span>{desc}</span> : null}
      </div>

      <div className={`household-stat-icon ${color}`}>{icon}</div>
    </div>
  );
}

function MockBar({ label, value, maxValue, color }) {
  const height = value ? Math.max(24, Math.round((value / maxValue) * 165)) : 0;

  return (
    <div className="household-bar-item">
      <div className="household-bar-area">
        <span className={color} style={{ height: `${height}px` }}>
          {value > 0 && <div className="bar-value">{value}</div>}
        </span>
      </div>

      <small>{label}</small>
    </div>
  );
}

function buildWaterGradient(distribution) {
  const level1 = distribution.level1 || 0;
  const level2 = distribution.level2 || 0;
  const level3 = distribution.level3 || 0;
  const total = level1 + level2 + level3;

  if (!total) {
    return "conic-gradient(#d1d5db 0 100%)";
  }

  const level1End = (level1 / total) * 100;
  const level2End = level1End + (level2 / total) * 100;

  return `conic-gradient(
    #f7c318 0 ${level1End}%,
    #27a56a ${level1End}% ${level2End}%,
    #1f7655 ${level2End}% 100%
  )`;
}

function formatHouseholdStatus(status) {
  const s = String(status || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (s.includes("completion") || s.includes("compliance")) return "For Compliance";
  if (s.includes("violation") || s.includes("assistance")) return "Needs Assistance";
  if (s.includes("upcoming")) return "Upcoming";
  return "Good Standing";
}

function statusClass(status = "") {
  const s = String(status || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (s.includes("completion") || s.includes("compliance")) return "for-compliance";
  if (s.includes("violation") || s.includes("assistance")) return "needs-assistance";
  if (s.includes("upcoming")) return "upcoming";
  return "good-standing";
}

export default HouseholdRecords;
