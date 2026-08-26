import React, { useEffect, useMemo, useState } from "react";
import {
  FiDownload,
  FiFileText,
  FiFilter,
  FiMapPin,
  FiPrinter,
  FiShield,
  FiUserCheck,
} from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";
import SanitaryVisualAnswer from "../components/SanitaryVisualAnswer";
import PageLoader from "../../shared/PageLoader";

function formatHouseholdStatus(status) {
  if (status === "for_completion" || status === "For Completion") return "For Compliance";
  if (status === "violation" || status === "Violation") return "Needs Assistance";
  if (status === "good_standing" || status === "Good Standing") return "Good Standing";
  return status || "Good Standing";
}

function statusClass(status = "") {
  if (status === "for_completion" || status === "For Completion" || status === "for-compliance")
    return "for-compliance";
  if (status === "violation" || status === "Violation" || status === "needs-assistance")
    return "needs-assistance";
  return "good-standing";
}

function HouseholdReportAnalytics() {
  const {
    householdRecords,
    loading,
    error,
    reportData,
    refreshReportData,
  } = useSanitationData();

  const [selectedBarangay, setSelectedBarangay] = useState("all");

  useEffect(() => {
    if (!reportData && refreshReportData) {
      refreshReportData();
    }
  }, [reportData, refreshReportData]);

  const barangayOptions = useMemo(() => {
    const names = Array.from(
      new Set(householdRecords.map((r) => r.barangay).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return ["all", ...names];
  }, [householdRecords]);

  // Filter household records based on chosen barangay
  const activeRecords = useMemo(() => {
    if (selectedBarangay === "all") return householdRecords;
    return householdRecords.filter((r) => r.barangay === selectedBarangay);
  }, [householdRecords, selectedBarangay]);

  // Dynamic summary for the selected barangay or all
  const summary = useMemo(() => buildLocalSummary(activeRecords), [activeRecords]);

  // Dynamic waste distribution for active records
  const wasteDistribution = useMemo(() => {
    return {
      collected: activeRecords.filter((r) => r.waste_disposal === "collected").length,
      composted: activeRecords.filter((r) => r.waste_disposal === "composted").length,
      burned: activeRecords.filter((r) => r.waste_disposal === "burned").length,
      dumped: activeRecords.filter((r) => r.waste_disposal === "dumped").length,
    };
  }, [activeRecords]);

  // Dynamic water distribution for active records
  const waterDistribution = useMemo(() => {
    return {
      level1: activeRecords.filter((r) => r.water_level === "level_1").length,
      level2: activeRecords.filter((r) => r.water_level === "level_2").length,
      level3: activeRecords.filter((r) => r.water_level === "level_3").length,
    };
  }, [activeRecords]);

  const barangayData = useMemo(
    () => buildBarangayInfrastructure(activeRecords),
    [activeRecords]
  );

  const maxBarangayTotal = Math.max(
    ...barangayData.map((item) => item.totalHouseholds || 0),
    1
  );

  function handlePrint() {
    window.print();
  }

  function handleExport() {
    const isSpecific = selectedBarangay !== "all";
    const filename = isSpecific
      ? `household-sanitation-report-${selectedBarangay.toLowerCase().replaceAll(" ", "-")}.csv`
      : "household-sanitation-report-all-barangays.csv";

    let headers = [];
    let rows = [];

    if (isSpecific) {
      headers = [
        "Household Code",
        "Household Head",
        "Barangay",
        "Members",
        "Toilet Type",
        "Water Level",
        "Water Source",
        "Waste Disposal",
        "Status",
      ];
      rows = activeRecords.map((r) => [
        r.household_code || "",
        r.household_head || "",
        r.barangay || "",
        r.total_members || 0,
        r.toilet_type_label || r.toilet_type || "",
        r.water_level_label || r.water_level || "",
        r.water_source || "",
        r.waste_disposal_label || r.waste_disposal || "",
        formatHouseholdStatus(r.status),
      ]);
    } else {
      headers = [
        "Barangay",
        "Total Households",
        "Safe Toilet",
        "Piped Water",
        "Proper Waste",
        "Needs Assistance",
        "For Compliance",
        "Good Standing",
      ];
      rows = barangayData.map((item) => [
        item.barangay,
        item.totalHouseholds,
        item.safeToilet,
        item.pipedWater,
        item.properWaste,
        item.atRisk,
        item.forCompletion,
        item.goodStanding,
      ]);
    }

    const csvContent = [headers, ...rows]
      .map((line) =>
        line
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="household-report-page">
        <PageLoader
          message="Loading Household Report Analytics..."
          subtext="Compiling barangay sanitation profiles and infrastructure"
          variant="content"
          theme="sanitation"
        />
      </div>
    );
  }

  const isSpecificBarangay = selectedBarangay !== "all";

  return (
    <div className="household-report-page">
      {/* ── Official Printable Header (Visible during Print) ── */}
      <div className="household-print-header">
        <div className="print-header-top">
          <h3>REPUBLIC OF THE PHILIPPINES</h3>
          <h4>PROVINCE OF QUEZON • MUNICIPALITY OF MAUBAN</h4>
          <h2>MUNICIPAL HEALTH OFFICE — SANITARY SECTION</h2>
          <p>BARANGAY SANITATION ASSESSMENT &amp; COMPLIANCE REPORT</p>
        </div>
        <div className="print-header-meta">
          <div>
            <strong>COVERAGE AREA:</strong>{" "}
            <span>{isSpecificBarangay ? `Barangay ${selectedBarangay}` : "All Mauban Barangays (Municipal-wide)"}</span>
          </div>
          <div>
            <strong>DATE GENERATED:</strong>{" "}
            <span>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          </div>
        </div>
      </div>

      {/* ── Web Page Header ── */}
      <div className="household-report-header">
        <div>
          <h1>Household Report &amp; Analytics</h1>
          <p>
            {isSpecificBarangay
              ? `Barangay Sanitation Assessment Profile for Brgy. ${selectedBarangay}`
              : "Municipal-wide household sanitation profile, infrastructure, and compliance dashboard"}
          </p>
        </div>

        <div className="household-report-actions">
          <button type="button" className="report-print-btn" onClick={handlePrint}>
            <FiPrinter />
            {isSpecificBarangay ? `Print Brgy. ${selectedBarangay} Report` : "Print Report"}
          </button>

          <button type="button" className="report-export-btn" onClick={handleExport}>
            <FiDownload />
            Export CSV
          </button>
        </div>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      {/* ── Barangay Filter Selector Toolbar ── */}
      <div className="household-barangay-filter-bar">
        <div className="hh-filter-left">
          <label htmlFor="hh-barangay-select">
            <FiFilter /> Filter by Barangay:
          </label>
          <select
            id="hh-barangay-select"
            value={selectedBarangay}
            onChange={(e) => setSelectedBarangay(e.target.value)}
          >
            {barangayOptions.map((b) => (
              <option key={b} value={b}>
                {b === "all" ? "All Mauban Barangays (Municipal Summary)" : `Brgy. ${b}`}
              </option>
            ))}
          </select>
        </div>

        {isSpecificBarangay ? (
          <div className="hh-filter-badge">
            <FiMapPin /> Showing data strictly for <strong>Brgy. {selectedBarangay}</strong> ({activeRecords.length} households)
          </div>
        ) : (
          <div className="hh-filter-badge municipal">
            <FiShield /> Showing consolidated data across <strong>{barangayOptions.length - 1} Barangays</strong> ({householdRecords.length} total households)
          </div>
        )}
      </div>

      {/* ── Stat Summary Cards ── */}
      <div className="household-report-stat-grid">
        <StatCard
          title={isSpecificBarangay ? `Total Households (Brgy. ${selectedBarangay})` : "Total Households"}
          value={summary.totalHouseholds || 0}
          color="blue"
        />
        <StatCard
          title="Good Standing"
          value={activeRecords.filter((item) => item.status === "good_standing").length}
          color="green"
        />
        <StatCard
          title="For Compliance"
          value={activeRecords.filter((item) => item.status === "for_completion").length}
          color="orange"
        />
        <StatCard
          title="Needs Assistance"
          value={summary.atRiskHouseholds || 0}
          color="red"
        />
      </div>

      {/* ── Charts Grid ── */}
      <div className="household-report-chart-grid">
        {/* If municipal view: show per-barangay comparison; if specific barangay: show water access breakdown */}
        {!isSpecificBarangay ? (
          <section className="household-report-card">
            <h3>Households per Barangay</h3>
            <div className="hr-bar-chart">
              {barangayData.length ? (
                barangayData.slice(0, 6).map((item) => (
                  <div className="hr-bar-group" key={item.barangay}>
                    <div className="hr-bars">
                      <span
                        className="compliant"
                        style={{
                          height: `${getBarHeight(item.goodStanding, maxBarangayTotal)}px`,
                        }}
                      />
                      <span
                        className="atrisk"
                        style={{
                          height: `${getBarHeight(item.atRisk, maxBarangayTotal)}px`,
                        }}
                      />
                    </div>
                    <small>{item.barangay}</small>
                  </div>
                ))
              ) : (
                <p className="household-empty-text">No barangay data found.</p>
              )}
            </div>

            <div className="household-chart-legend">
              <span className="red">Needs Assistance</span>
              <span className="green">Good Standing</span>
            </div>
          </section>
        ) : (
          <section className="household-report-card">
            <h3>Water Access Levels (Brgy. {selectedBarangay})</h3>
            <div className="water-donut-wrap">
              <div
                className="water-donut"
                style={{
                  background: buildWaterGradient(waterDistribution),
                }}
              />
              <span className="water-label top">{waterDistribution.level3 || 0}</span>
              <span className="water-label left">{waterDistribution.level1 || 0}</span>
              <span className="water-label bottom">{waterDistribution.level2 || 0}</span>
            </div>

            <div className="household-legend">
              <span className="yellow">Level I (Spring/Well/Rain): {waterDistribution.level1 || 0}</span>
              <span className="green">Level II (Communal Faucet): {waterDistribution.level2 || 0}</span>
              <span className="dark">Level III (Piped MWSS): {waterDistribution.level3 || 0}</span>
            </div>
          </section>
        )}

        <section className="household-report-card">
          <h3>Waste Disposal Methods {isSpecificBarangay ? `(Brgy. ${selectedBarangay})` : ""}</h3>

          <div className="waste-donut-wrap">
            <div
              className="waste-donut"
              style={{
                background: buildWasteGradient(wasteDistribution),
              }}
            />
            <span className="waste-label top-left">{wasteDistribution.burned || 0}</span>
            <span className="waste-label top-right">{wasteDistribution.collected || 0}</span>
            <span className="waste-label bottom-left">{wasteDistribution.composted || 0}</span>
            <span className="waste-label bottom-right">{wasteDistribution.dumped || 0}</span>
          </div>

          <div className="household-chart-legend">
            <span className="yellow">Burned: {wasteDistribution.burned || 0}</span>
            <span className="green">Collected by LGU: {wasteDistribution.collected || 0}</span>
            <span className="teal">Composted: {wasteDistribution.composted || 0}</span>
            <span className="red">Dumped: {wasteDistribution.dumped || 0}</span>
          </div>
        </section>
      </div>

      {/* ── Table Section: Municipal Infrastructure or Specific Barangay Household List ── */}
      {!isSpecificBarangay ? (
        <section className="infra-card">
          <div className="infra-card-header">
            <div className="infra-title">
              <FiMapPin />
              <div>
                <h3>Sanitation Infrastructure by Barangay</h3>
                <p>Access to safe toilets, piped water, and proper waste disposal across Mauban</p>
              </div>
            </div>

            <div className="infra-legend">
              <span>Safe Toilet</span>
              <span>Piped Water</span>
              <span>Proper Waste</span>
            </div>
          </div>

          <table className="infra-table">
            <thead>
              <tr>
                <th>Barangay</th>
                <th>Total Households</th>
                <th>Safe Toilet</th>
                <th>Piped Water</th>
                <th>Proper Waste</th>
                <th>Status Breakdown</th>
              </tr>
            </thead>

            <tbody>
              {barangayData.length ? (
                barangayData.map((item) => {
                  const toiletPercent = getPercent(item.safeToilet, item.totalHouseholds);
                  const waterPercent = getPercent(item.pipedWater, item.totalHouseholds);
                  const wastePercent = getPercent(item.properWaste, item.totalHouseholds);

                  return (
                    <tr key={item.barangay}>
                      <td>
                        <button
                          type="button"
                          className="link-style-btn"
                          onClick={() => setSelectedBarangay(item.barangay)}
                          title={`Click to filter strictly for Brgy. ${item.barangay}`}
                        >
                          <strong>{item.barangay}</strong> &rarr;
                        </button>
                      </td>
                      <td>{item.totalHouseholds}</td>

                      <td>
                        <Progress
                          color="green"
                          percent={toiletPercent}
                          value={`${item.safeToilet} (${toiletPercent}%)`}
                        />
                      </td>

                      <td>
                        <Progress
                          color="orange"
                          percent={waterPercent}
                          value={`${item.pipedWater} (${waterPercent}%)`}
                        />
                      </td>

                      <td>
                        <Progress
                          color="red"
                          percent={wastePercent}
                          value={`${item.properWaste} (${wastePercent}%)`}
                        />
                      </td>

                      <td>
                        <span className="risk-flag">
                          {item.goodStanding} Good Standing | {item.forCompletion} For Compliance | {item.atRisk} Needs Assistance
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="household-empty">
                    No household infrastructure records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ) : (
        /* Specific Barangay Detailed Household Roster */
        <section className="infra-card">
          <div className="infra-card-header">
            <div className="infra-title">
              <FiUserCheck />
              <div>
                <h3>Household Sanitation Registry — Brgy. {selectedBarangay}</h3>
                <p>Individual sanitary survey records for residents in Brgy. {selectedBarangay}</p>
              </div>
            </div>

            <button
              type="button"
              className="hh-view-all-btn"
              onClick={() => setSelectedBarangay("all")}
            >
              &larr; View All Barangays
            </button>
          </div>

          <table className="infra-table specific-roster">
            <thead>
              <tr>
                <th>Code</th>
                <th>Household Head</th>
                <th>Members</th>
                <th>Toilet Facility</th>
                <th>Water Source</th>
                <th>Waste Disposal</th>
                <th>Sanitation Status</th>
              </tr>
            </thead>
            <tbody>
              {activeRecords.length ? (
                activeRecords.map((r) => (
                  <tr key={r.id}>
                    <td><code>{r.household_code || "--"}</code></td>
                    <td>
                      <strong>{r.household_head}</strong>
                      <small style={{ display: "block", color: "#64748b" }}>{r.address || `Brgy. ${r.barangay}`}</small>
                    </td>
                    <td>{r.total_members}</td>
                    <td>{r.toilet_type_label || r.toilet_type}</td>
                    <td>
                      {r.water_level_label || r.water_level}
                      {r.water_source ? ` (${r.water_source})` : ""}
                    </td>
                    <td>{r.waste_disposal_label || r.waste_disposal}</td>
                    <td>
                      <span className={`household-status ${statusClass(r.status)}`}>
                        {formatHouseholdStatus(r.status)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="household-empty">
                    No household records found in Brgy. {selectedBarangay}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Official Sign-off block for Printouts ── */}
      <div className="household-print-signatures">
        <div className="signature-box">
          <div className="sign-line" />
          <strong>Sanitary Inspector / Encoder</strong>
          <span>Municipal Health Office - Mauban</span>
        </div>
        <div className="signature-box">
          <div className="sign-line" />
          <strong>Dr. Municipal Health Officer</strong>
          <span>Head of Municipal Health Services</span>
        </div>
      </div>

      {/* Insights Section */}
      <div style={{ marginTop: "24px" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: "800", color: "#0f172a" }}>
          Household Insights &amp; Actionables
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "18px" }}>
          {reportData?.questionAnswers
            ?.filter((item) =>
              [
                "household_poor_barangays",
                "household_risk_barangay",
                "household_safe_toilet_barangays",
                "household_no_water_barangays",
                "household_compliance_rate",
                "household_waste_distribution",
                "priority_households",
                "risk_factor",
                "barangay_risk",
              ].includes(item.id)
            )
            .map((item) => {
              const titles = {
                household_poor_barangays: "Poor Sanitation by Barangay",
                household_risk_barangay: "Highest Sanitation Concern Count",
                household_safe_toilet_barangays: "Safe Toilet Facilities by Barangay",
                household_no_water_barangays: "Lack of Piped Water by Barangay",
                household_compliance_rate: "Household Compliance Rate",
                household_waste_distribution: "Waste Disposal Methods",
                priority_households: "Priority Households (High Risk)",
                risk_factor: "Top Contributing Risk Factor",
                barangay_risk: "Barangay Risk Overview",
              };
              return (
                <div
                  key={item.id}
                  className="sanitary-question-item"
                  style={{
                    boxShadow: "0 10px 25px rgba(34, 72, 55, 0.12)",
                    background: "#ffffff",
                    border: "1px solid #d7e5e1",
                    borderRadius: "14px",
                    padding: "24px 26px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                    minHeight: "290px",
                    overflow: "visible",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <h4
                      style={{
                        margin: 0,
                        fontSize: "15.5px",
                        fontWeight: "800",
                        color: "#0f172a",
                        lineHeight: "1.4",
                      }}
                    >
                      {titles[item.id] || item.id}
                    </h4>
                    <SanitaryVisualAnswer item={item} summary={{}} />
                  </div>
                  <p
                    style={{
                      margin: "auto 0 0",
                      border: "1px solid #e2e8f0",
                      padding: "12px 16px",
                      background: "#f8fafc",
                      borderRadius: "8px",
                      fontSize: "13.5px",
                      color: "#334155",
                      lineHeight: "1.55",
                      fontWeight: "500",
                    }}
                  >
                    {item.answer}
                  </p>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }) {
  return (
    <div className="household-report-stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>

      <FiFileText className={color} />
    </div>
  );
}

function Progress({ color, value, percent }) {
  return (
    <div className="infra-progress-wrap">
      <div className="infra-progress">
        <span className={color} style={{ width: `${percent}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function buildLocalSummary(records) {
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
    waterAccessCoverage: total ? Math.round((withWaterAccess / total) * 100) : 0,
    atRiskHouseholds: records.filter((item) => item.status === "violation").length,
  };
}

function buildBarangayInfrastructure(records) {
  const grouped = {};

  records.forEach((record) => {
    const barangay = record.barangay || "Unspecified";

    if (!grouped[barangay]) {
      grouped[barangay] = {
        barangay,
        totalHouseholds: 0,
        safeToilet: 0,
        pipedWater: 0,
        properWaste: 0,
        atRisk: 0,
        forCompletion: 0,
        goodStanding: 0,
      };
    }

    grouped[barangay].totalHouseholds += 1;

    if (record.toilet_type !== "none") {
      grouped[barangay].safeToilet += 1;
    }

    if (["level_2", "level_3"].includes(record.water_level)) {
      grouped[barangay].pipedWater += 1;
    }

    if (["collected", "composted"].includes(record.waste_disposal)) {
      grouped[barangay].properWaste += 1;
    }

    if (record.status === "violation") {
      grouped[barangay].atRisk += 1;
    }

    if (record.status === "for_completion") {
      grouped[barangay].forCompletion += 1;
    }

    if (record.status === "good_standing") {
      grouped[barangay].goodStanding += 1;
    }
  });

  return Object.values(grouped).sort((a, b) => a.barangay.localeCompare(b.barangay));
}

function buildWasteGradient(distribution) {
  const burned = distribution.burned || 0;
  const collected = distribution.collected || 0;
  const composted = distribution.composted || 0;
  const dumped = distribution.dumped || 0;

  const total = burned + collected + composted + dumped;

  if (!total) {
    return "conic-gradient(#d1d5db 0 100%)";
  }

  const burnedEnd = (burned / total) * 100;
  const collectedEnd = burnedEnd + (collected / total) * 100;
  const compostedEnd = collectedEnd + (composted / total) * 100;

  return `conic-gradient(
    #f7c318 0 ${burnedEnd}%,
    #27a56a ${burnedEnd}% ${collectedEnd}%,
    #0f766e ${collectedEnd}% ${compostedEnd}%,
    #ef2222 ${compostedEnd}% 100%
  )`;
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

function getBarHeight(value, maxValue) {
  if (!value) {
    return 0;
  }

  return Math.max(24, Math.round((value / maxValue) * 165));
}

function getPercent(value, total) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

export default HouseholdReportAnalytics;
