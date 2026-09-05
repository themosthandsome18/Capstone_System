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
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import { useSanitationData } from "../context/SanitationDataContext";
import SanitaryVisualAnswer from "../components/SanitaryVisualAnswer";
import PageLoader from "../../shared/PageLoader";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

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

  const topBarangaysForChart = useMemo(() => {
    const list = [...barangayData].filter((b) => (b.totalHouseholds || 0) > 0);
    if (list.length === 0) return barangayData.slice(0, 8);
    return list
      .sort((a, b) => (b.totalHouseholds || 0) - (a.totalHouseholds || 0))
      .slice(0, 8);
  }, [barangayData]);

  const barangayBarChartData = useMemo(() => {
    return {
      labels: topBarangaysForChart.map((b) => b.barangay),
      datasets: [
        {
          label: "Good Standing",
          data: topBarangaysForChart.map((b) => b.goodStanding || 0),
          backgroundColor: "#10b981",
          borderRadius: 4,
          maxBarThickness: 26,
        },
        {
          label: "For Compliance",
          data: topBarangaysForChart.map((b) => b.forCompletion || 0),
          backgroundColor: "#f59e0b",
          borderRadius: 4,
          maxBarThickness: 26,
        },
        {
          label: "Needs Assistance",
          data: topBarangaysForChart.map((b) => b.atRisk || 0),
          backgroundColor: "#ef4444",
          borderRadius: 4,
          maxBarThickness: 26,
        },
      ],
    };
  }, [topBarangaysForChart]);

  const barangayBarChartOptions = useMemo(() => {
    const maxVal = Math.max(
      ...topBarangaysForChart.map((b) =>
        Math.max(b.goodStanding || 0, b.forCompletion || 0, b.atRisk || 0)
      ),
      5
    );

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11, weight: "600" },
            color: "#475569",
            padding: 10,
          },
        },
        tooltip: {
          backgroundColor: "#0f172a",
          padding: 10,
          cornerRadius: 8,
          titleFont: { size: 12, weight: "bold" },
          bodyFont: { size: 11.5 },
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} households`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11.5, weight: "600" },
            color: "#475569",
            maxRotation: 25,
            minRotation: 0,
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.ceil(maxVal * 1.15),
          grid: { color: "#f1f5f9" },
          ticks: {
            precision: 0,
            font: { size: 11 },
            color: "#64748b",
            stepSize: 1,
          },
        },
      },
    };
  }, [topBarangaysForChart]);

  const wasteChartData = useMemo(() => {
    return {
      labels: ["Collected by LGU", "Composted", "Burned", "Dumped"],
      datasets: [
        {
          data: [
            wasteDistribution.collected || 0,
            wasteDistribution.composted || 0,
            wasteDistribution.burned || 0,
            wasteDistribution.dumped || 0,
          ],
          backgroundColor: ["#10b981", "#0d9488", "#f59e0b", "#ef4444"],
          borderWidth: 2,
          borderColor: "#ffffff",
          hoverOffset: 6,
        },
      ],
    };
  }, [wasteDistribution]);

  const wasteDonutOptions = useMemo(() => {
    const total =
      (wasteDistribution.collected || 0) +
      (wasteDistribution.composted || 0) +
      (wasteDistribution.burned || 0) +
      (wasteDistribution.dumped || 0);

    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "66%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11.5, weight: "600" },
            color: "#334155",
            padding: 10,
            generateLabels: (chart) => {
              const data = chart.data;
              return data.labels.map((label, i) => {
                const val = data.datasets[0].data[i] || 0;
                const pct = total ? Math.round((val / total) * 100) : 0;
                return {
                  text: `${label}: ${val} (${pct}%)`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  strokeStyle: data.datasets[0].backgroundColor[i],
                  lineWidth: 0,
                  index: i,
                };
              });
            },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed || 0;
              const pct = total ? Math.round((val / total) * 100) : 0;
              return ` ${ctx.label}: ${val} households (${pct}%)`;
            },
          },
        },
      },
    };
  }, [wasteDistribution]);

  const waterChartData = useMemo(() => {
    return {
      labels: [
        "Level I (Spring/Well/Rain)",
        "Level II (Communal Faucet)",
        "Level III (Piped MWSS)",
      ],
      datasets: [
        {
          data: [
            waterDistribution.level1 || 0,
            waterDistribution.level2 || 0,
            waterDistribution.level3 || 0,
          ],
          backgroundColor: ["#f59e0b", "#0d9488", "#10b981"],
          borderWidth: 2,
          borderColor: "#ffffff",
          hoverOffset: 6,
        },
      ],
    };
  }, [waterDistribution]);

  const waterDonutOptions = useMemo(() => {
    const total =
      (waterDistribution.level1 || 0) +
      (waterDistribution.level2 || 0) +
      (waterDistribution.level3 || 0);

    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "66%",
      plugins: {
        legend: {
          position: "right",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11.5, weight: "600" },
            color: "#334155",
            padding: 10,
            generateLabels: (chart) => {
              const data = chart.data;
              return data.labels.map((label, i) => {
                const val = data.datasets[0].data[i] || 0;
                const pct = total ? Math.round((val / total) * 100) : 0;
                return {
                  text: `${label}: ${val} (${pct}%)`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  strokeStyle: data.datasets[0].backgroundColor[i],
                  lineWidth: 0,
                  index: i,
                };
              });
            },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed || 0;
              const pct = total ? Math.round((val / total) * 100) : 0;
              return ` ${ctx.label}: ${val} households (${pct}%)`;
            },
          },
        },
      },
    };
  }, [waterDistribution]);

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

      {/* ── Charts Grid (Evenly Balanced with Chart.js) ── */}
      <div className="household-report-chart-grid">
        {!isSpecificBarangay ? (
          <section className="household-report-card">
            <div className="household-report-card-header">
              <h3>Households per Barangay</h3>
              <small className="hh-chart-subtitle">
                Comparative compliance and risk monitoring across top {topBarangaysForChart.length} barangays
              </small>
            </div>
            <div className="hh-chart-container">
              {topBarangaysForChart.length ? (
                <Bar data={barangayBarChartData} options={barangayBarChartOptions} />
              ) : (
                <p className="household-empty-text">No barangay data found.</p>
              )}
            </div>
          </section>
        ) : (
          <section className="household-report-card">
            <div className="household-report-card-header">
              <h3>Water Access Levels (Brgy. {selectedBarangay})</h3>
              <small className="hh-chart-subtitle">
                {summary.totalHouseholds || 0} total households in Brgy. {selectedBarangay}
              </small>
            </div>
            <div className="hh-chart-container hh-donut-container">
              <Doughnut data={waterChartData} options={waterDonutOptions} />
              <div className="hh-donut-center-stat">
                <strong>{summary.totalHouseholds || 0}</strong>
                <small>Households</small>
              </div>
            </div>
          </section>
        )}

        <section className="household-report-card">
          <div className="household-report-card-header">
            <h3>Waste Disposal Methods {isSpecificBarangay ? `(Brgy. ${selectedBarangay})` : ""}</h3>
            <small className="hh-chart-subtitle">
              Sanitary solid waste management and collection distribution
            </small>
          </div>

          <div className="hh-chart-container hh-donut-container">
            <Doughnut data={wasteChartData} options={wasteDonutOptions} />
            <div className="hh-donut-center-stat">
              <strong>{summary.totalHouseholds || 0}</strong>
              <small>Households</small>
            </div>
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

          <div className="infra-table-container">
            <table className="infra-table">
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>Barangay</th>
                  <th style={{ width: "11%" }}>Total Households</th>
                  <th style={{ width: "17%" }}>Safe Toilet</th>
                  <th style={{ width: "17%" }}>Piped Water</th>
                  <th style={{ width: "17%" }}>Proper Waste</th>
                  <th style={{ width: "20%" }}>Status Breakdown</th>
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
                        <td>
                          <span style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a" }}>
                            {item.totalHouseholds}
                          </span>
                        </td>

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

                        <td className="hh-breakdown-td">
                          <div className="hh-breakdown-cell">
                            {item.totalHouseholds > 0 && (
                              <div className="hh-breakdown-bar">
                                <span
                                  className="hh-seg-good"
                                  style={{ width: `${getPercent(item.goodStanding, item.totalHouseholds)}%` }}
                                  title={`Good Standing: ${item.goodStanding} (${getPercent(item.goodStanding, item.totalHouseholds)}%)`}
                                />
                                <span
                                  className="hh-seg-comp"
                                  style={{ width: `${getPercent(item.forCompletion, item.totalHouseholds)}%` }}
                                  title={`For Compliance: ${item.forCompletion} (${getPercent(item.forCompletion, item.totalHouseholds)}%)`}
                                />
                                <span
                                  className="hh-seg-risk"
                                  style={{ width: `${getPercent(item.atRisk, item.totalHouseholds)}%` }}
                                  title={`Needs Assistance: ${item.atRisk} (${getPercent(item.atRisk, item.totalHouseholds)}%)`}
                                />
                              </div>
                            )}

                            <div className="hh-breakdown-chips">
                              <span className="hh-chip hh-chip-good" title="Good Standing">
                                <span className="hh-chip-dot" />
                                <strong>{item.goodStanding}</strong> Good
                              </span>
                              <span className="hh-chip hh-chip-comp" title="For Compliance">
                                <span className="hh-chip-dot" />
                                <strong>{item.forCompletion}</strong> Compliance
                              </span>
                              <span className="hh-chip hh-chip-risk" title="Needs Assistance">
                                <span className="hh-chip-dot" />
                                <strong>{item.atRisk}</strong> Assistance
                              </span>
                            </div>
                          </div>
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
          </div>
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

          <div className="infra-table-container">
            <table className="infra-table specific-roster">
              <thead>
                <tr>
                  <th style={{ width: "13%" }}>Code</th>
                  <th style={{ width: "22%" }}>Household Head</th>
                  <th style={{ width: "8%" }}>Members</th>
                  <th style={{ width: "17%" }}>Toilet Facility</th>
                  <th style={{ width: "15%" }}>Water Source</th>
                  <th style={{ width: "13%" }}>Waste Disposal</th>
                  <th style={{ width: "12%" }}>Sanitation Status</th>
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
          </div>
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



function getPercent(value, total) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

export default HouseholdReportAnalytics;
