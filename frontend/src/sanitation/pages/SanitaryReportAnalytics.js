import { useEffect, useMemo, useState } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Pie } from "react-chartjs-2";
import {
  FiAlertTriangle,
  FiAlertCircle,
  FiCalendar,
  FiClock,
  FiDownload,
  FiFileText,
  FiFilter,
  FiMapPin,
  FiPrinter,
  FiRefreshCw,
  FiShield,
  FiTrendingUp,
} from "react-icons/fi";
import { useSanitationData } from "../context/SanitationDataContext";

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

const defaultFilters = {
  barangay: "all",
  business_type_id: "all",
  permit_status: "all",
  compliance_status: "all",
};

const permitStatusOptions = [
  { value: "active", label: "Active" },
  { value: "renewal_due", label: "Renewal Due" },
  { value: "conditional", label: "Conditional" },
  { value: "suspended", label: "Suspended" },
  { value: "no_permit", label: "No Permit" },
];

const complianceStatusOptions = [
  { value: "good_standing", label: "Good Standing" },
  { value: "upcoming", label: "Upcoming" },
  { value: "for_completion", label: "For Completion" },
  { value: "violation", label: "Violation" },
  { value: "no_permit", label: "No Permit" },
];

const sanitationTitleMap = {
  permit_status: "Sanitary Permit Standing",
  immediate_action: "Urgent Enforcement & Inspection Queue",
  inspection_effect: "Impact of Recent Inspections",
  repeated_issues: "Recurring Complaints & Issues",
  resolution_time: "Violation Resolution Efficiency",
  likely_compliant: "Establishments Near Full Compliance",
  household_poor_barangays: "Barangays with Poor Sanitation",
  household_profile: "Barangay Sanitation Profiles",
  priority_households: "High-Risk Households Priority Watch",
  risk_factor: "Dominant Household Risk Factors",
  geographic_risk: "Geographic Risk Hotspots",
};

function SanitaryReportAnalytics() {
  const {
    reportData,
    establishments,
    businessTypes,
    barangays,
    loading,
    error,
    refreshReportData,
  } = useSanitationData();
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [reportLoading, setReportLoading] = useState(false);
  const [filterError, setFilterError] = useState("");
  const [activeQuestionGroup, setActiveQuestionGroup] = useState("establishment");

  useEffect(() => {
    let isMounted = true;

    async function loadInitialReport() {
      setReportLoading(true);
      setFilterError("");

      try {
        await refreshReportData(cleanReportFilters(defaultFilters));
      } catch (requestError) {
        if (isMounted) {
          setFilterError(requestError.message || "Unable to load sanitation report.");
        }
      } finally {
        if (isMounted) {
          setReportLoading(false);
        }
      }
    }

    loadInitialReport();

    return () => {
      isMounted = false;
    };
    // The context refresh function is recreated when data changes, so this
    // initial report load intentionally runs once on page entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const localEstablishments = useMemo(
    () => filterEstablishments(establishments, appliedFilters),
    [appliedFilters, establishments]
  );
  const summary = reportData?.summary || buildLocalSummary(localEstablishments);
  const byType = reportData?.byType || buildLocalByType(localEstablishments);
  const questionAnswers = useMemo(
    () => reportData?.questionAnswers || [],
    [reportData?.questionAnswers]
  );
  const complaintSummary = reportData?.complaints?.summary || {};
  const complaintCategories = reportData?.complaints?.byCategory || [];
  const requirementTracker = reportData?.requirementTracker || [];
  const riskHotspots = reportData?.riskHotspots || [];
  const renewalAlerts = reportData?.renewalAlerts || {};
  const needsAttention = reportData?.needsAttention || [];

  const barangayOptions = useMemo(
    () => buildBarangayOptions(barangays, establishments),
    [barangays, establishments]
  );
  const businessTypeOptions = useMemo(
    () => buildBusinessTypeOptions(businessTypes, byType),
    [businessTypes, byType]
  );
  const totalSp = byType.reduce((total, item) => total + (item.sp || 0), 0);
  const totalLarge = byType.reduce((total, item) => total + (item.large || 0), 0);
  const permitTotal = totalSp + totalLarge;
  const lastUpdated = reportData?.generatedAt
    ? formatDateTime(reportData.generatedAt)
    : "Waiting for report data";
  const questionGroups = useMemo(
    () => groupQuestionAnswers(questionAnswers),
    [questionAnswers]
  );
  const activeQuestionSection =
    questionGroups.find((group) => group.id === activeQuestionGroup) ||
    questionGroups[0];
  const priorityActions = buildPriorityActions(
    summary,
    needsAttention,
    riskHotspots,
    renewalAlerts
  );
  const typeChartData = buildTypeChartData(byType);
  const permitChartData = buildPermitChartData(totalLarge, totalSp);

  async function loadReport(nextFilters) {
    setReportLoading(true);
    setFilterError("");

    try {
      await refreshReportData(cleanReportFilters(nextFilters));
    } catch (requestError) {
      setFilterError(requestError.message || "Unable to load sanitation report.");
    } finally {
      setReportLoading(false);
    }
  }

  async function handleApplyFilters(event) {
    event.preventDefault();
    setAppliedFilters(filters);
    await loadReport(filters);
  }

  async function handleResetFilters() {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    await loadReport(defaultFilters);
  }

  function handleFilterChange(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handlePrint() {
    window.print();
  }

  function handleExport() {
    const headers = [
      "Business Type",
      "Inspection Frequency",
      "Total",
      "With Permit",
      "Without Permit",
      "SP",
      "Large",
      "Good Standing",
      "Upcoming",
      "For Completion",
      "Violators",
      "No Permit",
    ];

    const csvRows = byType.map((item) => [
      item.name,
      item.inspection_frequency,
      item.total,
      item.withPermit,
      item.withoutPermit,
      item.sp,
      item.large,
      item.goodStanding,
      item.upcoming,
      item.forCompletion,
      item.violators,
      item.noPermit,
    ]);

    const csvContent = [headers, ...csvRows]
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
    link.download = "sanitary-business-report.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading || (reportLoading && !reportData)) {
    return <div className="sanitary-report-page">Loading sanitation reports...</div>;
  }

  return (
    <div className="sanitary-report-page">
      <section className="report-print-header">
        <div className="report-print-seal">MHO</div>
        <div>
          <p>Republic of the Philippines</p>
          <h1>Mauban Municipality Health Office</h1>
          <strong>Sanitary Section Monitoring Report</strong>
          <span>Generated: {lastUpdated}</span>
        </div>
      </section>

      <div className="sanitary-report-header">
        <div>
          <h1>Business Report & Analytics</h1>
          <p>Business permit and sanitary compliance analytics</p>
          <span className="report-last-updated">Last updated: {lastUpdated}</span>
        </div>

        <div className="sanitary-report-actions">
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
      {filterError ? <p className="sanitation-error-text">{filterError}</p> : null}

      <form className="sanitary-report-filter-card" onSubmit={handleApplyFilters}>
        <label>
          <span>Barangay</span>
          <select
            value={filters.barangay}
            onChange={(event) => handleFilterChange("barangay", event.target.value)}
          >
            <option value="all">All Barangays</option>
            {barangayOptions.map((barangay) => (
              <option key={barangay} value={barangay}>
                {barangay}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Business Type</span>
          <select
            value={filters.business_type_id}
            onChange={(event) =>
              handleFilterChange("business_type_id", event.target.value)
            }
          >
            <option value="all">All Types</option>
            {businessTypeOptions.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Permit Status</span>
          <select
            value={filters.permit_status}
            onChange={(event) =>
              handleFilterChange("permit_status", event.target.value)
            }
          >
            <option value="all">All Permit Statuses</option>
            {permitStatusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Compliance Status</span>
          <select
            value={filters.compliance_status}
            onChange={(event) =>
              handleFilterChange("compliance_status", event.target.value)
            }
          >
            <option value="all">All Compliance Statuses</option>
            {complianceStatusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>

        <div className="report-filter-actions">
          <button type="submit" disabled={reportLoading}>
            <FiFilter />
            {reportLoading ? "Applying..." : "Apply"}
          </button>
          <button type="button" onClick={handleResetFilters} disabled={reportLoading}>
            <FiRefreshCw />
            Reset
          </button>
        </div>
      </form>

      <div className="sanitary-report-stat-grid">
        <ReportStat
          label="Total Establishments"
          value={summary.totalEstablishments || 0}
          color="blue"
        />
        <ReportStat
          label="Good Standing"
          value={summary.goodStanding || 0}
          color="green"
        />
        <ReportStat
          label="For Completion"
          value={summary.forCompletion || 0}
          color="orange"
        />
        <ReportStat
          label="Upcoming"
          value={summary.upcoming || 0}
          color="yellow"
        />
        <ReportStat
          label="Violators"
          value={summary.violators || 0}
          color="red"
        />
      </div>

      <section className="priority-action-summary">
        {priorityActions.map((item) => (
          <article key={item.label} className={`priority-action-card ${item.tone}`}>
            {item.icon}
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.note}</p>
            </div>
          </article>
        ))}
      </section>

      <div className="sanitary-report-chart-grid">
        <section className="sanitary-report-card establishment-chart-card">
          <h3>Establishments per Type</h3>
          <div
            className="chart-canvas-wrap type-chart"
            style={{ height: `${Math.max(290, byType.length * 36)}px` }}
          >
            {byType.length ? (
              <Bar data={typeChartData} options={typeChartOptions} />
            ) : (
              <p className="submission-empty">No chart data available.</p>
            )}
          </div>
        </section>

        <section className="sanitary-report-card pie-chart-card">
          <h3>Permit Size Distribution</h3>
          <div className="permit-distribution-visual">
            <div className="chart-canvas-wrap doughnut-chart">
              {permitTotal ? (
                <Doughnut data={permitChartData} options={permitChartOptions} />
              ) : (
                <p className="submission-empty">No permit size data.</p>
              )}
            </div>

            <div className="permit-distribution-list">
              <PermitSizeRow
                label="Large"
                value={totalLarge}
                total={permitTotal}
                tone="large"
              />
              <PermitSizeRow
                label="SP"
                value={totalSp}
                total={permitTotal}
                tone="small"
              />
            </div>
          </div>
        </section>
      </div>

      <div className="sanitary-question-title-row" style={{ marginTop: "24px", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#0f7a45" }}>Administrative & Community Insights</h3>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>Grouped decision support from permits, inspections, complaints, and household data</p>
      </div>

      <div className="question-tabs" style={{ background: "transparent", padding: 0, borderBottom: "1px solid #e2e8f0", marginBottom: "16px" }}>
        {questionGroups.map((group) => (
          <button
            type="button"
            key={group.id}
            className={activeQuestionSection?.id === group.id ? "active" : ""}
            onClick={() => setActiveQuestionGroup(group.id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeQuestionSection?.id === group.id ? "2px solid #0f7a45" : "none",
              padding: "10px 16px",
              fontWeight: "700",
              color: activeQuestionSection?.id === group.id ? "#0f7a45" : "#64748b",
              cursor: "pointer",
            }}
          >
            {group.label}
            <span style={{
              marginLeft: "6px",
              background: activeQuestionSection?.id === group.id ? "#0f7a45" : "#e2e8f0",
              color: activeQuestionSection?.id === group.id ? "#ffffff" : "#475569",
              borderRadius: "999px",
              padding: "2px 6px",
              fontSize: "10px",
            }}>{group.items.length}</span>
          </button>
        ))}
      </div>

      <div className="sanitary-question-grid" style={{ marginTop: 0 }}>
        {activeQuestionSection?.items.length ? (
          activeQuestionSection.items.map((item) => (
            <article
              key={item.id || item.question}
              className="sanitary-question-item"
              style={{
                boxShadow: "0 10px 25px rgba(34, 72, 55, 0.12)",
                background: "#ffffff",
                border: "1px solid #d7e5e1",
                borderRadius: "12px",
                padding: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                minHeight: "260px",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: "13px", fontWeight: "800", color: "#111827", lineHeight: "1.35" }}>
                  {sanitationTitleMap[item.id] || item.question}
                </h4>
                <SanitaryVisualAnswer item={item} summary={summary} />
              </div>
              <p style={{ margin: "auto 0 0", border: 0, padding: 0, fontSize: "11px", color: "#4b5563", lineHeight: "1.45" }}>
                {item.answer}
              </p>
            </article>
          ))
        ) : (
          <p className="submission-empty">No insights available.</p>
        )}
      </div>

      <section className="sanitary-insight-card">
        <h3>Top Establishments Needing Attention</h3>
        <div className="attention-ranking">
          {needsAttention.length ? (
            needsAttention.map((item, index) => (
              <div className="attention-row" key={item.id}>
                <strong>{index + 1}</strong>
                <div>
                  <h4>{item.business_name}</h4>
                  <p>
                    {item.business_type_name} | {item.barangay}
                  </p>
                  <span>{(item.reasons || []).join(", ")}</span>
                </div>
                <b className={riskClass(item.riskLevel)}>{item.riskScore}</b>
              </div>
            ))
          ) : (
            <p className="submission-empty">No priority establishments found.</p>
          )}
        </div>
      </section>

      <div className="sanitary-insight-grid">
        <section className="sanitary-insight-card">
          <h3>Requirement Compliance Tracker</h3>
          <InsightBars rows={requirementTracker} />
        </section>

        <section className="sanitary-insight-card">
          <h3>Complaint Status</h3>
          <div className="complaint-mini-status">
            <MiniSummary label="Pending" value={complaintSummary.pending || 0} color="yellow" icon={<FiAlertTriangle />} />
            <MiniSummary label="Investigating" value={complaintSummary.investigating || 0} color="orange" icon={<FiFileText />} />
            <MiniSummary label="Resolved" value={complaintSummary.resolved || 0} color="green" icon={<FiShield />} />
            <MiniSummary label="High Priority" value={complaintSummary.highPriority || 0} color="red" icon={<FiAlertTriangle />} />
          </div>
        </section>
      </div>

      <div className="sanitary-insight-grid">
        <section className="sanitary-insight-card">
          <h3>Common Complaint Categories</h3>
          <InsightBars rows={complaintCategories} />
        </section>

        <section className="sanitary-insight-card">
          <h3>Barangay Hotspots</h3>
          <div className="hotspot-list">
            {riskHotspots.length ? (
              riskHotspots.map((item) => (
                <div className="hotspot-row" key={item.barangay}>
                  <span>{item.barangay}</span>
                  <strong>{item.riskScore}</strong>
                  <small>
                    {item.sanitationConcerns} concerns, {item.complaints} complaints
                  </small>
                </div>
              ))
            ) : (
              <p className="submission-empty">No hotspot data yet.</p>
            )}
          </div>
        </section>
      </div>

      <section className="sanitary-insight-card">
        <h3>Renewal Alerts</h3>
        <div className="renewal-alert-columns">
          <RenewalAlertList title="Expiring Soon" rows={renewalAlerts.expiringSoon || []} />
          <RenewalAlertList title="Expired" rows={renewalAlerts.expired || []} />
          <RenewalAlertList title="Payment Pending" rows={renewalAlerts.paymentPending || []} />
        </div>
      </section>

      <section className="summary-report-card">
        <div className="summary-report-top">
          <div className="summary-title">
            <FiFileText />

            <div>
              <h3>Summary Report</h3>
              <p>Business permit and sanitary compliance snapshot</p>
            </div>
          </div>

          <div className="compliance-rate-box">
            <p>Compliance Rate</p>
            <h2>{summary.complianceRate || 0}%</h2>
          </div>
        </div>

        <div className="summary-report-body">
          <div className="summary-left">
            <div
              className="summary-progress-bar"
              style={{
                gridTemplateColumns: buildProgressColumns(summary),
              }}
            >
              <span className="green" />
              <span className="yellow" />
              <span className="orange" />
              <span className="red" />
            </div>

            <div className="summary-mini-grid">
              <MiniSummary
                label="Good Standing"
                value={summary.goodStanding || 0}
                color="green"
                icon={<FiShield />}
              />

              <MiniSummary
                label="Upcoming"
                value={summary.upcoming || 0}
                color="yellow"
                icon={<FiCalendar />}
              />

              <MiniSummary
                label="For Completion"
                value={summary.forCompletion || 0}
                color="orange"
                icon={<FiFileText />}
              />

              <MiniSummary
                label="Violators"
                value={summary.violators || 0}
                color="red"
                icon={<FiAlertTriangle />}
              />
            </div>
          </div>

          <div className="generated-brief-box">
            <h3>Generated Brief</h3>

            <p>
              Out of{" "}
              <strong>{summary.totalEstablishments || 0}</strong> monitored
              establishments,{" "}
              <span className="green-text">{summary.goodStanding || 0}</span>{" "}
              are in good standing, while{" "}
              <span className="red-text">{summary.violators || 0}</span>{" "}
              require enforcement attention.
            </p>

            <div className="brief-mini-grid">
              <div>
                <p>Next inspection queue</p>
                <h2>{summary.upcoming || 0}</h2>
              </div>

              <div>
                <p>Pending requirements</p>
                <h2>{summary.forCompletion || 0}</h2>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="summary-report-card">
        <div className="summary-report-top">
          <div className="summary-title">
            <FiFileText />

            <div>
              <h3>Report Breakdown by Business Type</h3>
              <p>Total, permit coverage, permit size, and compliance status</p>
            </div>
          </div>
        </div>

        <div className="sanitary-report-table-wrap">
          <table className="sanitary-report-table">
            <thead>
              <tr>
                <th>Business Type</th>
                <th>Total</th>
                <th>With Permit</th>
                <th>No Permit</th>
                <th>SP</th>
                <th>Large</th>
                <th>Good</th>
                <th>For Completion</th>
                <th>Violators</th>
              </tr>
            </thead>

            <tbody>
              {byType.length ? (
                byType.map((item) => (
                  <tr key={item.id || item.name}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{formatFrequency(item.inspection_frequency)}</small>
                    </td>
                    <td>{item.total || 0}</td>
                    <td>{item.withPermit || 0}</td>
                    <td>{item.withoutPermit || item.noPermit || 0}</td>
                    <td>{item.sp || 0}</td>
                    <td>{item.large || 0}</td>
                    <td>{item.goodStanding || 0}</td>
                    <td>{item.forCompletion || 0}</td>
                    <td>{item.violators || 0}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="submission-empty">
                    No report data found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReportStat({ label, value, color }) {
  return (
    <div className="sanitary-report-stat-card">
      <div>
        <p>{label}</p>
        <h2>{value}</h2>
      </div>

      <FiFileText className={`report-stat-icon ${color}`} />
    </div>
  );
}

function PermitSizeRow({ label, value, total, tone }) {
  const percent = total ? Math.round((value / total) * 100) : 0;

  return (
    <div className={`permit-size-row ${tone}`}>
      <span>
        <i />
        {label}
      </span>
      <strong>{value}</strong>
      <em>{percent}%</em>
    </div>
  );
}

function MiniSummary({ label, value, color, icon }) {
  return (
    <div className={`mini-summary-card ${color}`}>
      <p>
        {label}
        {icon}
      </p>

      <h2>{value}</h2>
    </div>
  );
}

function InsightBars({ rows }) {
  const max = Math.max(...rows.map((item) => item.total || 0), 1);

  return (
    <div className="insight-bars">
      {rows.length ? (
        rows.slice(0, 8).map((item) => (
          <div className="insight-bar-row" key={item.name}>
            <span>{formatStatusName(item.name)}</span>
            <div>
              <b style={{ width: `${Math.max(8, ((item.total || 0) / max) * 100)}%` }} />
            </div>
            <strong>{item.total || 0}</strong>
          </div>
        ))
      ) : (
        <p className="submission-empty">No data available.</p>
      )}
    </div>
  );
}

function RenewalAlertList({ title, rows }) {
  return (
    <div className="renewal-alert-list">
      <h4>{title}</h4>
      {rows.length ? (
        rows.slice(0, 5).map((item) => (
          <div key={item.id}>
            <strong>{item.establishment_name}</strong>
            <span>{item.stage_label} | {item.expiration_date}</span>
          </div>
        ))
      ) : (
        <p>No records.</p>
      )}
    </div>
  );
}

function cleanReportFilters(filters) {
  return Object.entries(filters).reduce(
    (params, [key, value]) => {
      if (value && value !== "all") {
        params[key] = value;
      }

      return params;
    },
    { include_questions: true }
  );
}

function filterEstablishments(establishments, filters) {
  return establishments.filter((item) => {
    return (
      (filters.barangay === "all" || item.barangay === filters.barangay) &&
      (filters.business_type_id === "all" ||
        String(item.business_type) === String(filters.business_type_id)) &&
      (filters.permit_status === "all" ||
        item.permit_status === filters.permit_status) &&
      (filters.compliance_status === "all" ||
        item.compliance_status === filters.compliance_status)
    );
  });
}

function buildBarangayOptions(barangays, establishments) {
  const names = new Set();

  barangays.forEach((item) => {
    if (item.name) {
      names.add(item.name);
    }
  });

  establishments.forEach((item) => {
    if (item.barangay) {
      names.add(item.barangay);
    }
  });

  return [...names].sort((a, b) => a.localeCompare(b));
}

function buildBusinessTypeOptions(businessTypes, byType) {
  if (businessTypes.length) {
    return businessTypes
      .map((item) => ({ value: String(item.id), label: item.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return byType
    .map((item) => ({ value: String(item.id || item.name), label: item.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildTypeChartData(byType) {
  return {
    labels: byType.map((item) => item.name),
    datasets: [
      {
        label: "Total",
        data: byType.map((item) => item.total || 0),
        backgroundColor: "#1f7655",
        borderRadius: 6,
        barThickness: 16,
      },
      {
        label: "Violators",
        data: byType.map((item) => item.violators || 0),
        backgroundColor: "#ef2222",
        borderRadius: 6,
        barThickness: 16,
      },
    ],
  };
}

function buildPermitChartData(totalLarge, totalSp) {
  return {
    labels: ["Large", "SP"],
    datasets: [
      {
        data: [totalLarge, totalSp],
        backgroundColor: ["#1f7655", "#36a87a"],
        borderColor: "#ffffff",
        borderWidth: 3,
        hoverOffset: 4,
      },
    ],
  };
}

const typeChartOptions = {
  indexAxis: "y",
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        boxWidth: 12,
        color: "#0f172a",
        font: { size: 11, weight: "bold" },
      },
    },
    tooltip: {
      callbacks: {
        title: (items) => items[0]?.label || "",
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: { precision: 0 },
      grid: { color: "#e5ece8" },
    },
    y: {
      ticks: {
        autoSkip: false,
        color: "#334155",
        font: { size: 11, weight: "bold" },
      },
      grid: { display: false },
    },
  },
};

const permitChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "62%",
  plugins: {
    legend: {
      position: "bottom",
      labels: {
        boxWidth: 12,
        color: "#0f172a",
        font: { size: 11, weight: "bold" },
      },
    },
  },
};

function buildPriorityActions(summary, needsAttention, riskHotspots, renewalAlerts) {
  const expiredCount = renewalAlerts.expired?.length || 0;
  const topRisk = riskHotspots[0];

  return [
    {
      label: "Immediate Follow-up",
      value: needsAttention.length,
      note: "Establishments ranked by sanitation risk",
      tone: "red",
      icon: <FiAlertTriangle />,
    },
    {
      label: "Inspection Queue",
      value: summary.upcoming || 0,
      note: "Upcoming or due inspection records",
      tone: "yellow",
      icon: <FiCalendar />,
    },
    {
      label: "Renewal Watch",
      value: expiredCount,
      note: "Expired renewal records in alert list",
      tone: "orange",
      icon: <FiTrendingUp />,
    },
    {
      label: "Top Risk Area",
      value: topRisk?.barangay || "None",
      note: topRisk ? `${topRisk.riskScore} combined risk score` : "No hotspot data",
      tone: "green",
      icon: <FiMapPin />,
    },
  ];
}

function groupQuestionAnswers(questionAnswers) {
  const groups = [
    {
      id: "establishment",
      label: "Establishments",
      visuals: [
        "permit_status",
        "needs_attention",
        "inspection_status",
        "recurring",
        "resolution_time",
        "compliance_prediction",
      ],
      items: [],
    },
    {
      id: "household",
      label: "Households",
      visuals: [
        "household_risk_barangay",
        "household_profile",
        "priority_households",
        "risk_factor",
      ],
      items: [],
    },
    {
      id: "geographic",
      label: "Risk Areas",
      visuals: ["risk_map", "barangay_risk"],
      items: [],
    },
  ];

  questionAnswers.forEach((item) => {
    const group =
      groups.find((entry) => entry.visuals.includes(item.visual)) || groups[0];
    group.items.push(item);
  });

  return groups;
}

function buildLocalSummary(establishments) {
  const total = establishments.length;
  const goodStanding = establishments.filter(
    (item) => item.compliance_status === "good_standing"
  ).length;

  return {
    totalEstablishments: total,
    goodStanding,
    upcoming: establishments.filter(
      (item) => item.compliance_status === "upcoming"
    ).length,
    forCompletion: establishments.filter(
      (item) => item.compliance_status === "for_completion"
    ).length,
    violators: establishments.filter(
      (item) => item.compliance_status === "violation"
    ).length,
    noPermit: establishments.filter(
      (item) => item.compliance_status === "no_permit"
    ).length,
    complianceRate: total ? Math.round((goodStanding / total) * 100) : 0,
  };
}

function buildLocalByType(establishments) {
  const grouped = {};

  establishments.forEach((item) => {
    const key = item.business_type_name || "Uncategorized";

    if (!grouped[key]) {
      grouped[key] = {
        id: key,
        name: key,
        inspection_frequency: item.inspection_frequency,
        total: 0,
        withPermit: 0,
        withoutPermit: 0,
        sp: 0,
        large: 0,
        goodStanding: 0,
        upcoming: 0,
        forCompletion: 0,
        violators: 0,
        noPermit: 0,
      };
    }

    grouped[key].total += 1;

    if (item.has_permit) {
      grouped[key].withPermit += 1;
    } else {
      grouped[key].withoutPermit += 1;
    }

    if (item.permit_size === "sp") {
      grouped[key].sp += 1;
    }

    if (item.permit_size === "large") {
      grouped[key].large += 1;
    }

    if (item.compliance_status === "good_standing") {
      grouped[key].goodStanding += 1;
    }

    if (item.compliance_status === "upcoming") {
      grouped[key].upcoming += 1;
    }

    if (item.compliance_status === "for_completion") {
      grouped[key].forCompletion += 1;
    }

    if (item.compliance_status === "violation") {
      grouped[key].violators += 1;
    }

    if (item.compliance_status === "no_permit") {
      grouped[key].noPermit += 1;
    }
  });

  return Object.values(grouped);
}

function buildProgressColumns(summary) {
  const total = summary.totalEstablishments || 0;

  if (!total) {
    return "1fr 1fr 1fr 1fr";
  }

  const good = Math.max(summary.goodStanding || 0, 0.1);
  const upcoming = Math.max(summary.upcoming || 0, 0.1);
  const completion = Math.max(summary.forCompletion || 0, 0.1);
  const violators = Math.max(summary.violators || 0, 0.1);

  return `${good}fr ${upcoming}fr ${completion}fr ${violators}fr`;
}

function formatFrequency(value = "") {
  if (value === "monthly") return "Monthly";
  if (value === "quarterly") return "Quarterly";
  if (value === "annual") return "Annual";
  return value || "Not Set";
}

function formatStatusName(value = "") {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function riskClass(value = "") {
  if (value.toLowerCase().includes("high")) return "high";
  if (value.toLowerCase().includes("medium")) return "medium";
  return "low";
}



function SanitaryVisualAnswer({ item, summary }) {
  const text = item.answer || "";
  const id = item.id;

  if (!text || text.includes("No matching") || text.includes("No establishment") || text.includes("No priority")) {
    return null;
  }

  // 1. Monitored Establishments
  if (id === "monitored_establishments") {
    const numbers = [...text.matchAll(/\d+/g)].map(Number);
    const count = numbers[0] || 0;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "15px 0" }}>
        <div style={{
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "#e6f4f3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0f7a45",
          fontSize: "18px",
          flexShrink: 0,
        }}>
          <FiFileText />
        </div>
        <div>
          <strong style={{ fontSize: "24px", fontWeight: "900", color: "#0f7a45", lineHeight: 1 }}>
            {count}
          </strong>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", display: "block", marginTop: "2px" }}>
            total monitored establishments
          </span>
        </div>
      </div>
    );
  }

  // 2. Compliance Rate
  if (id === "compliance_rate") {
    const numbers = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(Number);
    const goodCount = numbers[0] || 0;
    const totalCount = numbers[1] || 0;
    const rate = numbers[2] || 0;

    const radius = 26;
    const strokeWidth = 5;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (rate / 100) * circumference;

    return (
      <div className="radial-progress-widget" style={{ display: "flex", alignItems: "center", gap: "14px", margin: "10px 0" }}>
        <svg width="70" height="70" viewBox="0 0 70 70" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
          <circle cx="35" cy="35" r={radius} fill="transparent" stroke="#f1f5f9" strokeWidth={strokeWidth} />
          <circle cx="35" cy="35" r={radius} fill="transparent" stroke="#0f7a45" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
        </svg>
        <div>
          <strong style={{ fontSize: "18px", fontWeight: "900", color: "#0f7a45", lineHeight: 1.1 }}>{rate}%</strong>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#1e293b", display: "block", marginTop: "2px" }}>Compliance Rate</span>
          <small style={{ fontSize: "10px", color: "#64748b" }}>{goodCount} of {totalCount} in good standing</small>
        </div>
      </div>
    );
  }

  // 3. Top-leads shares (largest_business_type, violation_business_type, barangay_risk, household_poor_barangays, risk_factor)
  if (
    id === "largest_business_type" ||
    id === "violation_business_type" ||
    id === "barangay_risk" ||
    id === "household_poor_barangays" ||
    id === "risk_factor"
  ) {
    const parts = text.split(" leads with ");
    let name = parts[0] || "Top Item";
    if (id === "risk_factor") {
      const mainPart = text.split(" contributes the most ");
      name = mainPart[0] || "Risk Factor";
    }

    const numbers = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(Number);
    const value = numbers[0] || 0;
    const total = numbers[1] || 0;
    const others = Math.max(0, total - value);

    const chartData = {
      labels: [name, "Others"],
      datasets: [
        {
          data: [value, others],
          backgroundColor: ["#0f7a45", "#cbd5e1"],
          borderWidth: 0,
        },
      ],
    };

    return (
      <div style={{ height: "115px", position: "relative", margin: "5px 0" }}>
        <Pie
          data={chartData}
          options={{
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: "right",
                labels: {
                  boxWidth: 8,
                  font: { size: 9, weight: "bold" },
                  color: "#475569",
                  padding: 4,
                },
              },
              tooltip: { enabled: true },
            },
          }}
        />
      </div>
    );
  }

  // 4. Requirements Queue
  if (id === "requirements_queue") {
    const numbers = [...text.matchAll(/\d+/g)].map(Number);
    const completion = numbers[0] || 0;
    const upcoming = numbers[1] || 0;

    const chartData = {
      labels: ["For Completion", "Upcoming Inspection"],
      datasets: [
        {
          data: [completion, upcoming],
          backgroundColor: ["#f59e0b", "#3b82f6"],
          borderWidth: 0,
        },
      ],
    };

    return (
      <div style={{ height: "115px", position: "relative", margin: "5px 0" }}>
        <Doughnut
          data={chartData}
          options={{
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: "right",
                labels: {
                  boxWidth: 8,
                  font: { size: 9, weight: "bold" },
                  color: "#475569",
                  padding: 4,
                },
              },
              tooltip: { enabled: true },
            },
          }}
        />
      </div>
    );
  }

  // 5. Permit Gap
  if (id === "permit_gap") {
    const numbers = [...text.matchAll(/\d+/g)].map(Number);
    const withoutPermit = numbers[0] || 0;
    const noPermitStatus = numbers[1] || 0;

    const chartData = {
      labels: ["Missing Permit Flag", "No-Permit Status"],
      datasets: [
        {
          data: [withoutPermit, noPermitStatus],
          backgroundColor: ["#ef4444", "#f97316"],
          borderWidth: 0,
        },
      ],
    };

    return (
      <div style={{ height: "115px", position: "relative", margin: "5px 0" }}>
        <Pie
          data={chartData}
          options={{
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: "right",
                labels: {
                  boxWidth: 8,
                  font: { size: 9, weight: "bold" },
                  color: "#475569",
                  padding: 4,
                },
              },
              tooltip: { enabled: true },
            },
          }}
        />
      </div>
    );
  }

  // 6. Permit Status Distribution
  if (id === "permit_status") {
    const parts = text.split(", ");
    const items = parts.map(part => {
      const [label, valStr] = part.split(": ");
      return { label: label || "Unknown", value: Number(valStr || 0) };
    }).filter(item => !isNaN(item.value) && item.value > 0);

    if (items.length) {
      const chartData = {
        labels: items.map(item => item.label),
        datasets: [
          {
            data: items.map(item => item.value),
            backgroundColor: ["#0f7a45", "#3b82f6", "#f59e0b", "#ef4444", "#94a3b8"],
            borderWidth: 0,
          },
        ],
      };

      return (
        <div style={{ height: "115px", position: "relative", margin: "5px 0" }}>
          <Doughnut
            data={chartData}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: "right",
                  labels: {
                    boxWidth: 8,
                    font: { size: 9, weight: "bold" },
                    color: "#475569",
                    padding: 4,
                  },
                },
                tooltip: { enabled: true },
              },
            }}
          />
        </div>
      );
    }
  }

  // 7. Inspection Frequency Queue
  if (id === "inspection_frequency_queue") {
    const parts = text.split("; ");
    const items = parts.map(part => {
      const [label, valStr] = part.split(": ");
      return { label: label ? label.replace(" queue", "").replace("monthly", "Monthly").replace("quarterly", "Quarterly").replace("annual", "Annual") : "Unknown", value: Number(valStr || 0) };
    }).filter(item => !isNaN(item.value));

    if (items.length) {
      const chartData = {
        labels: items.map(item => item.label),
        datasets: [
          {
            data: items.map(item => item.value),
            backgroundColor: ["#10b981", "#3b82f6", "#f59e0b"],
            borderWidth: 0,
          },
        ],
      };

      return (
        <div style={{ height: "115px", position: "relative", margin: "5px 0" }}>
          <Doughnut
            data={chartData}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: "right",
                  labels: {
                    boxWidth: 8,
                    font: { size: 9, weight: "bold" },
                    color: "#475569",
                    padding: 4,
                  },
                },
                tooltip: { enabled: true },
              },
            }}
          />
        </div>
      );
    }
  }

  // 8. Geographic Risk / Risk Map
  if (id === "geographic_risk") {
    const matches = [...text.matchAll(/([A-Za-z0-9\s.]+)\s*\((\d+)\)/g)];
    const items = matches.map(m => ({
      label: m[1].trim(),
      value: Number(m[2])
    }));

    if (items.length) {
      const chartData = {
        labels: items.map(item => item.label),
        datasets: [
          {
            data: items.map(item => item.value),
            backgroundColor: "#ef4444",
            borderRadius: 4,
            maxBarThickness: 15,
          },
        ],
      };

      return (
        <div style={{ height: "115px", position: "relative", margin: "5px 0" }}>
          <Bar
            data={chartData}
            options={{
              indexAxis: "y",
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { enabled: true },
              },
              scales: {
                x: {
                  beginAtZero: true,
                  ticks: { font: { size: 8 }, color: "#64748b" },
                  grid: { color: "rgba(148, 163, 184, 0.1)" },
                },
                y: {
                  ticks: { font: { size: 8 }, color: "#64748b" },
                  grid: { display: false },
                },
              },
            }}
          />
        </div>
      );
    }
  }

  // 9. Urgent / Immediate Action lists
  if (id === "immediate_action" || id === "urgent_attention") {
    const listText = text.replace("Immediate follow-up list: ", "").replace("Immediate inspection list: ", "");
    const names = listText.split(", ").filter(name => name.trim().length > 0);
    
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", margin: "10px 0" }}>
        {names.map((name, index) => (
          <div key={index} style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#fef2f2",
            border: "1px solid #fee2e2",
            borderRadius: "6px",
            padding: "6px 10px",
            fontSize: "11px",
            color: "#991b1b",
            fontWeight: "700"
          }}>
            <FiAlertCircle style={{ color: "#ef4444" }} />
            <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{name}</span>
          </div>
        ))}
      </div>
    );
  }

  // 10. Priority Households
  if (id === "priority_households") {
    const matches = [...text.matchAll(/([A-Za-z0-9\s.,]+)\s*\(([^)]+)\)/g)];
    const items = matches.map(m => ({
      name: m[1].trim(),
      risk: m[2].trim()
    }));

    if (items.length) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", margin: "10px 0" }}>
          {items.map((item, index) => {
            const isHigh = item.risk.toLowerCase().includes("high");
            const isMedium = item.risk.toLowerCase().includes("medium");
            const badgeBg = isHigh ? "#fee2e2" : isMedium ? "#ffedd5" : "#f0fdf4";
            const badgeColor = isHigh ? "#991b1b" : isMedium ? "#c2410c" : "#166534";
            return (
              <div key={index} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "11px"
              }}>
                <span style={{ fontWeight: "700", color: "#334155" }}>{item.name}</span>
                <span style={{
                  background: badgeBg,
                  color: badgeColor,
                  padding: "2px 6px",
                  borderRadius: "999px",
                  fontSize: "9px",
                  fontWeight: "800"
                }}>{item.risk}</span>
              </div>
            );
          })}
        </div>
      );
    }
  }

  // 11. Resolution Time
  if (id === "resolution_time") {
    const numbers = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(Number);
    const days = numbers[0] || 0;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "15px 0" }}>
        <div style={{
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "#fef3c7",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#d97706",
          fontSize: "18px",
          flexShrink: 0,
        }}>
          <FiClock />
        </div>
        <div>
          <strong style={{ fontSize: "24px", fontWeight: "900", color: "#d97706", lineHeight: 1 }}>
            {days}
          </strong>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", display: "block", marginTop: "2px" }}>
            average resolution time (days)
          </span>
        </div>
      </div>
    );
  }

  return null;
}

export default SanitaryReportAnalytics;
