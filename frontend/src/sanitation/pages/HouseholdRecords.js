import { useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiDroplet,
  FiEdit2,
  FiEye,
  FiHome,
  FiPlus,
  FiSearch,
  FiX,
} from "react-icons/fi";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
import { useSanitationData } from "../context/SanitationDataContext";

const statusOptions = [
  { value: "all", label: "All" },
  { value: "good_standing", label: "Good Standing" },
  { value: "for_completion", label: "For Completion" },
  { value: "violation", label: "Violation" },
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

const wasteOptions = [
  { value: "collected", label: "Collected by LGU" },
  { value: "composted", label: "Composted" },
  { value: "burned", label: "Burned" },
  { value: "dumped", label: "Dumped" },
];

const statusFormOptions = [
  { value: "good_standing", label: "Good Standing" },
  { value: "for_completion", label: "For Completion" },
  { value: "violation", label: "Violation" },
];

const emptyForm = {
  household_head: "",
  barangay: "",
  address: "",
  male_count: 0,
  female_count: 0,
  toilet_type: "water_sealed",
  water_level: "level_3",
  water_source: "",
  waste_disposal: "collected",
  status: "good_standing",
  last_survey_date: "",
  remarks: "",
};

function HouseholdRecords() {
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
    const recordBarangays = Array.from(
      new Set(
        householdRecords.map((item) => item.barangay).filter(Boolean)
      )
    ).sort();
    const combined = [...officialBarangays];

    recordBarangays.forEach((barangay) => {
      if (!combined.includes(barangay)) {
        combined.push(barangay);
      }
    });

    return ["all", ...combined];
  }, [barangays, householdRecords]);

  const barangayRecords = useMemo(() => {
    if (barangayFilter === "all") {
      return householdRecords;
    }

    return householdRecords.filter((item) => item.barangay === barangayFilter);
  }, [householdRecords, barangayFilter]);

  const summary = householdDashboardData?.summary || {
    totalHouseholds: 0,
    withSanitaryFacility: 0,
    sanitaryFacilityCoverage: 0,
    withWaterAccess: 0,
    waterAccessCoverage: 0,
    atRiskHouseholds: 0,
  };

  const riskByBarangay = useMemo(() => {
    let globalRisk = householdDashboardData?.riskByBarangay || [];
    if (barangayFilter !== "all") {
      globalRisk = globalRisk.filter((item) => item.barangay === barangayFilter);
    }
    // Filter out barangays with 0 risk and sort descending
    return globalRisk
      .filter((item) => item.atRisk > 0)
      .sort((a, b) => b.atRisk - a.atRisk);
  }, [householdDashboardData, barangayFilter]);

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
    setForm({
      household_head: record.household_head || "",
      barangay: record.barangay || "",
      address: record.address || "",
      male_count: record.male_count ?? 0,
      female_count: record.female_count ?? 0,
      toilet_type: record.toilet_type || "water_sealed",
      water_level: record.water_level || "level_3",
      water_source: record.water_source || "",
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
    if (!form.household_head.trim()) {
      setFormError("Household Head is required.");
      return;
    }
    if (!form.barangay.trim()) {
      setFormError("Barangay is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await createHousehold({
        ...form,
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
    if (!form.household_head.trim()) {
      setFormError("Household Head is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await updateHousehold(editRecord.id, {
        ...form,
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

      <div className="household-stat-grid">
        <HouseholdStat
          title="Total Households"
          value={summary.totalHouseholds || 0}
          icon={<FiHome />}
          color="green"
        />

        <HouseholdStat
          title="With Sanitary Facility"
          value={summary.withSanitaryFacility || 0}
          desc={`${summary.sanitaryFacilityCoverage || 0}% coverage`}
          icon={<FiHome />}
          color="dark"
        />

        <HouseholdStat
          title="With Water Access"
          value={summary.withWaterAccess || 0}
          desc={`${summary.waterAccessCoverage || 0}% level II & III`}
          icon={<FiDroplet />}
          color="blue"
        />

        <HouseholdStat
          title="At-Risk Households"
          value={summary.atRiskHouseholds || 0}
          icon={<FiAlertTriangle />}
          color="red"
        />
      </div>

      <div className="household-chart-grid">
        <section className="household-chart-card">
          <div className="household-chart-title">
            <div>
              <h3>High Risk Households by Barangay</h3>
              <p>Across all barangays - violation status</p>
            </div>

            {highestRiskBarangay ? (
              <div className="risk-badge">
                <span>Highest Risk</span>
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
              <h3>Toilet Type Distribution</h3>
              <p>{summary.totalHouseholds || 0} households</p>
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
              label="None"
              value={toiletDistribution.none || 0}
              maxValue={maxToiletValue}
              color="red"
            />
          </div>
        </section>

        <section className="household-chart-card">
          <div className="household-chart-title">
            <div>
              <h3>Waste Disposal Methods</h3>
              <p>{summary.totalHouseholds || 0} households</p>
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
          <h3>Water Access Levels</h3>

          <div className="water-donut-wrap">
            <div
              className="water-donut"
              style={{
                background: buildWaterGradient(waterDistribution),
              }}
            />
            <span className="water-label top">
              {waterDistribution.level3 || 0}
            </span>
            <span className="water-label left">
              {waterDistribution.level1 || 0}
            </span>
            <span className="water-label bottom">
              {waterDistribution.level2 || 0}
            </span>
          </div>

          <div className="household-legend">
            <span className="yellow">Level I</span>
            <span className="green">Level II</span>
            <span className="dark">Level III</span>
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
                {barangay === "all" ? "All Mauban Barangays" : barangay}
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
                        className={`household-status ${statusClass(
                          row.status_label
                        )}`}
                      >
                        {row.status_label}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="hh-action-btn view"
                          title="View Details"
                          onClick={() => setViewRecord(row)}
                        >
                          <FiEye size={14} />
                        </button>
                        <button
                          type="button"
                          className="hh-action-btn edit"
                          title="Edit Record"
                          onClick={() => openEdit(row)}
                        >
                          <FiEdit2 size={14} />
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
                <span className={`household-status ${statusClass(viewRecord.status_label)}`}>
                  {viewRecord.status_label}
                </span>
              </div>
              <button type="button" className="hh-modal-close" onClick={closeModals}>
                <FiX />
              </button>
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
              <h2>Add Household Record</h2>
              <button type="button" className="hh-modal-close" onClick={closeModals}>
                <FiX />
              </button>
            </div>

            <div className="hh-modal-body">
              <HouseholdForm
                form={form}
                updateField={updateField}
                barangayOptions={barangayOptions.filter((b) => b !== "all")}
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
                barangayOptions={barangayOptions.filter((b) => b !== "all")}
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

/* ── Reusable form shared by Add and Edit ── */
function HouseholdForm({ form, updateField, barangayOptions, formError }) {
  return (
    <div className="hh-form-grid">
      {formError && <p className="hh-form-error">{formError}</p>}

      <div className="hh-form-group hh-full">
        <label>Household Head *</label>
        <input
          type="text"
          value={form.household_head}
          onChange={(e) => updateField("household_head", e.target.value)}
          placeholder="Full name of household head"
        />
      </div>

      <div className="hh-form-group">
        <label>Barangay *</label>
        {barangayOptions.length > 0 ? (
          <select
            value={form.barangay}
            onChange={(e) => updateField("barangay", e.target.value)}
          >
            <option value="">Select barangay...</option>
            {barangayOptions.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={form.barangay}
            onChange={(e) => updateField("barangay", e.target.value)}
            placeholder="Barangay name"
          />
        )}
      </div>

      <div className="hh-form-group hh-full">
        <label>Address</label>
        <input
          type="text"
          value={form.address}
          onChange={(e) => updateField("address", e.target.value)}
          placeholder="House no., street, sitio"
        />
      </div>

      <div className="hh-form-group">
        <label>Male Members</label>
        <input
          type="number"
          min="0"
          value={form.male_count}
          onChange={(e) => updateField("male_count", e.target.value)}
        />
      </div>

      <div className="hh-form-group">
        <label>Female Members</label>
        <input
          type="number"
          min="0"
          value={form.female_count}
          onChange={(e) => updateField("female_count", e.target.value)}
        />
      </div>

      <div className="hh-form-group">
        <label>Toilet Type</label>
        <select value={form.toilet_type} onChange={(e) => updateField("toilet_type", e.target.value)}>
          {toiletOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="hh-form-group">
        <label>Water Level</label>
        <select value={form.water_level} onChange={(e) => updateField("water_level", e.target.value)}>
          {waterLevelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="hh-form-group">
        <label>Water Source</label>
        <input
          type="text"
          value={form.water_source}
          onChange={(e) => updateField("water_source", e.target.value)}
          placeholder="e.g. MWSS, Deep Well"
        />
      </div>

      <div className="hh-form-group">
        <label>Waste Disposal</label>
        <select value={form.waste_disposal} onChange={(e) => updateField("waste_disposal", e.target.value)}>
          {wasteOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="hh-form-group">
        <label>Status</label>
        <select value={form.status} onChange={(e) => updateField("status", e.target.value)}>
          {statusFormOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="hh-form-group">
        <label>Last Survey Date</label>
        <input
          type="date"
          value={form.last_survey_date}
          onChange={(e) => updateField("last_survey_date", e.target.value)}
        />
      </div>

      <div className="hh-form-group hh-full">
        <label>Remarks</label>
        <textarea
          rows={3}
          value={form.remarks}
          onChange={(e) => updateField("remarks", e.target.value)}
          placeholder="Additional notes..."
        />
      </div>
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

function buildHouseholdSummary(records) {
  const total = records.length;
  const withSanitaryFacility = records.filter(
    (item) => item.toilet_type !== "none"
  ).length;
  const withWaterAccess = records.filter((item) =>
    ["level_2", "level_3"].includes(item.water_level)
  ).length;

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
    atRiskHouseholds: records.filter((item) => item.status === "violation")
      .length,
  };
}

function buildRiskRows(records, barangayNames) {
  return barangayNames
    .map((barangay) => {
      const barangayRecords = records.filter(
        (item) => item.barangay === barangay
      );

      return {
        barangay,
        total: barangayRecords.length,
        atRisk: barangayRecords.filter((item) => item.status === "violation")
          .length,
        forCompletion: barangayRecords.filter(
          (item) => item.status === "for_completion"
        ).length,
        goodStanding: barangayRecords.filter(
          (item) => item.status === "good_standing"
        ).length,
      };
    })
    .filter((item) => item.total > 0)
    .sort(
      (a, b) =>
        b.atRisk - a.atRisk ||
        b.forCompletion - a.forCompletion ||
        b.total - a.total ||
        a.barangay.localeCompare(b.barangay)
    );
}

function countBy(records, field, value) {
  return records.filter((item) => item[field] === value).length;
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

function statusClass(status = "") {
  return status.toLowerCase().replaceAll(" ", "-");
}

export default HouseholdRecords;
