import { FiDownload, FiFileText, FiMapPin, FiPrinter } from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

function HouseholdReportAnalytics() {
  const { householdRecords, householdDashboardData, loading, error } =
    useSanitationData();

  const summary = householdDashboardData?.summary || buildLocalSummary(householdRecords);
  const barangayData = buildBarangayInfrastructure(householdRecords);
  const wasteDistribution = householdDashboardData?.wasteDistribution || {};
  const maxBarangayTotal = Math.max(
    ...barangayData.map((item) => item.totalHouseholds || 0),
    1
  );

  function handlePrint() {
    window.print();
  }

  function handleExport() {
    const headers = [
      "Barangay",
      "Total Households",
      "Safe Toilet",
      "Piped Water",
      "Proper Waste",
      "At Risk",
      "For Completion",
      "Good Standing",
    ];

    const rows = barangayData.map((item) => [
      item.barangay,
      item.totalHouseholds,
      item.safeToilet,
      item.pipedWater,
      item.properWaste,
      item.atRisk,
      item.forCompletion,
      item.goodStanding,
    ]);

    const csvContent = [headers, ...rows]
      .map((line) =>
        line
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "household-sanitation-report.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="household-report-page">
        Loading household report analytics...
      </div>
    );
  }

  return (
    <div className="household-report-page">
      <div className="household-report-header">
        <div>
          <h1>Household Report & Analytics</h1>
          <p>Household sanitation profile, infrastructure, and risk dashboard</p>
        </div>

        <div className="household-report-actions">
          <button type="button" className="report-print-btn" onClick={handlePrint}>
            <FiPrinter />
            Print
          </button>

          <button type="button" className="report-export-btn" onClick={handleExport}>
            <FiDownload />
            Export CSV
          </button>
        </div>
      </div>

      {error ? <p className="sanitation-error-text">{error}</p> : null}

      <div className="household-report-stat-grid">
        <StatCard
          title="Total Households"
          value={summary.totalHouseholds || 0}
          color="blue"
        />
        <StatCard
          title="With Sanitary Facility"
          value={summary.withSanitaryFacility || 0}
          color="green"
        />
        <StatCard
          title="For Completion"
          value={
            householdRecords.filter((item) => item.status === "for_completion")
              .length
          }
          color="orange"
        />
        <StatCard
          title="At-Risk"
          value={summary.atRiskHouseholds || 0}
          color="red"
        />
      </div>

      <div className="household-report-chart-grid">
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
                        height: `${getBarHeight(
                          item.goodStanding,
                          maxBarangayTotal
                        )}px`,
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
            <span className="red">At Risk</span>
            <span className="green">Good Standing</span>
          </div>
        </section>

        <section className="household-report-card">
          <h3>Waste Disposal Methods</h3>

          <div className="waste-donut-wrap">
            <div
              className="waste-donut"
              style={{
                background: buildWasteGradient(wasteDistribution),
              }}
            />
            <span className="waste-label top-left">
              {wasteDistribution.burned || 0}
            </span>
            <span className="waste-label top-right">
              {wasteDistribution.collected || 0}
            </span>
            <span className="waste-label bottom-left">
              {wasteDistribution.composted || 0}
            </span>
            <span className="waste-label bottom-right">
              {wasteDistribution.dumped || 0}
            </span>
          </div>

          <div className="household-chart-legend">
            <span className="yellow">Burned</span>
            <span className="green">Collected</span>
            <span className="teal">Composted</span>
            <span className="red">Dumped</span>
          </div>
        </section>
      </div>

      <section className="infra-card">
        <div className="infra-card-header">
          <div className="infra-title">
            <FiMapPin />
            <div>
              <h3>Sanitation Infrastructure by Barangay</h3>
              <p>Access to safe toilets, piped water, and proper waste disposal</p>
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
              <th>HSS</th>
              <th>Safe Toilet</th>
              <th>Piped Water</th>
              <th>Proper Waste</th>
              <th>Risk Flags</th>
            </tr>
          </thead>

          <tbody>
            {barangayData.length ? (
              barangayData.map((item) => {
                const toiletPercent = getPercent(
                  item.safeToilet,
                  item.totalHouseholds
                );
                const waterPercent = getPercent(
                  item.pipedWater,
                  item.totalHouseholds
                );
                const wastePercent = getPercent(
                  item.properWaste,
                  item.totalHouseholds
                );
                const noToilet = item.totalHouseholds - item.safeToilet;

                return (
                  <tr key={item.barangay}>
                    <td>{item.barangay}</td>
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
                        Info: {noToilet} no toilet | {item.atRisk} at-risk
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
