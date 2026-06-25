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
import { Bar, Doughnut } from "react-chartjs-2";
import {
  FiAlertTriangle,
  FiCalendar,
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
import SanitaryVisualAnswer from "../components/SanitaryVisualAnswer";

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
  // Business Report & Analytics titles
  monitored_establishments: "Monitored Establishments Summary",
  compliance_rate: "Sanitation Compliance Rate",
  largest_business_type: "Monitored Establishments by Business Type",
  violation_business_type: "Sanitation Violations by Business Type",
  requirements_queue: "Pending Requirements & Queue Status",
  permit_gap: "Permit Status & Missing Records",
  barangay_risk: "Sanitation Concerns by Barangay",
  inspection_frequency_queue: "Inspection Frequency Queues",
  urgent_attention: "Establishments Needing Immediate Attention",

  // Existing/Other titles
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
      id: "geographic",
      label: "Risk Areas",
      visuals: ["risk_map"],
      items: [],
    },
  ];

  questionAnswers.forEach((item) => {
    // Skip household questions to avoid them falling back to Establishment group
    if (["household_poor_barangays", "household_risk_barangay", "household_profile", "priority_households", "risk_factor", "barangay_risk", "household_safe_toilet_barangays", "household_no_water_barangays", "household_compliance_rate", "household_waste_distribution"].includes(item.id)) {
      return;
    }
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




export default SanitaryReportAnalytics;
