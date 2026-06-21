import { useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiChevronLeft,
  FiChevronRight,
  FiDownload,
  FiDroplet,
  FiHome,
  FiSearch,
} from "react-icons/fi";
import { datedCsvFilename, exportCsv } from "../../shared/csvExport";
import { useSanitationData } from "../context/SanitationDataContext";

const statusOptions = [
  { value: "all", label: "All" },
  { value: "good_standing", label: "Good Standing" },
  { value: "for_completion", label: "For Completion" },
  { value: "violation", label: "Violation" },
];

function HouseholdRecords() {
  const { barangays, householdRecords, loading, error } =
    useSanitationData();

  const [barangayFilter, setBarangayFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

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

  const summary = useMemo(
    () => buildHouseholdSummary(barangayRecords),
    [barangayRecords]
  );

  const riskByBarangay = useMemo(() => {
    const names =
      barangayFilter === "all"
        ? barangayOptions.filter((barangay) => barangay !== "all")
        : [barangayFilter];

    return buildRiskRows(householdRecords, names);
  }, [householdRecords, barangayOptions, barangayFilter]);

  const toiletDistribution = useMemo(
    () => ({
      waterSealed: countBy(barangayRecords, "toilet_type", "water_sealed"),
      pourFlush: countBy(barangayRecords, "toilet_type", "pour_flush"),
      pitLatrine: countBy(barangayRecords, "toilet_type", "pit_latrine"),
      none: countBy(barangayRecords, "toilet_type", "none"),
    }),
    [barangayRecords]
  );

  const wasteDistribution = useMemo(
    () => ({
      collected: countBy(barangayRecords, "waste_disposal", "collected"),
      composted: countBy(barangayRecords, "waste_disposal", "composted"),
      burned: countBy(barangayRecords, "waste_disposal", "burned"),
      dumped: countBy(barangayRecords, "waste_disposal", "dumped"),
    }),
    [barangayRecords]
  );

  const waterDistribution = useMemo(
    () => ({
      level1: countBy(barangayRecords, "water_level", "level_1"),
      level2: countBy(barangayRecords, "water_level", "level_2"),
      level3: countBy(barangayRecords, "water_level", "level_3"),
    }),
    [barangayRecords]
  );

  const filteredHouseholds = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return barangayRecords.filter((item) => {
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
    });
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

        <button
          type="button"
          className="sanitation-export-btn"
          onClick={handleExport}
        >
          <FiDownload /> Export CSV
        </button>
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="household-empty">
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
        <span className={color} style={{ height: `${height}px` }} />
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
