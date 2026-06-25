import React from "react";
import { Bar, Doughnut } from "react-chartjs-2";
import { FiAlertCircle, FiClock, FiFileText } from "react-icons/fi";

export default function SanitaryVisualAnswer({ item, summary }) {
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", flex: 1, padding: "30px 0" }}>
        <div style={{
          width: "80px",
          height: "80px",
          borderRadius: "50%",
          background: "#e6f4f3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0f7a45",
          fontSize: "36px",
          flexShrink: 0,
          boxShadow: "0 4px 10px rgba(15, 122, 69, 0.15)"
        }}>
          <FiFileText />
        </div>
        <div style={{ textAlign: "center" }}>
          <strong style={{ fontSize: "56px", fontWeight: "900", color: "#0f7a45", lineHeight: 1 }}>
            {count}
          </strong>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#64748b", display: "block", marginTop: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Total Monitored Establishments
          </span>
        </div>
      </div>
    );
  }

  // 2. Compliance Rate
  if (id === "compliance_rate" || id === "household_compliance_rate") {
    const numbers = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(Number);
    const goodCount = numbers[0] || 0;
    const totalCount = numbers[1] || 0;
    const rate = numbers[2] || 0;

    const radius = 54;
    const strokeWidth = 10;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (rate / 100) * circumference;

    return (
      <div className="radial-progress-widget" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", flex: 1, padding: "20px 0" }}>
        <div style={{ position: "relative", width: "130px", height: "130px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="130" height="130" viewBox="0 0 130 130" style={{ transform: "rotate(-90deg)", position: "absolute", top: 0, left: 0 }}>
            <circle cx="65" cy="65" r={radius} fill="transparent" stroke="#f1f5f9" strokeWidth={strokeWidth} />
            <circle cx="65" cy="65" r={radius} fill="transparent" stroke="#0f7a45" strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
          </svg>
          <strong style={{ fontSize: "32px", fontWeight: "900", color: "#0f7a45", lineHeight: 1 }}>{rate}%</strong>
        </div>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: "13px", fontWeight: "700", color: "#1e293b", display: "block", textTransform: "uppercase", letterSpacing: "0.5px" }}>Compliance Rate</span>
          <small style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", display: "block" }}>{goodCount} of {totalCount} in good standing</small>
        </div>
      </div>
    );
  }

  // 3a. Risk Factor — distinct colored bars for comparison
  if (id === "risk_factor") {
    if (item.chart_data && item.chart_data.length > 0) {
      const riskColors = ["#ef4444", "#f97316", "#f59e0b"];
      const chartData = {
        labels: item.chart_data.map(d => d.name),
        datasets: [
          {
            data: item.chart_data.map(d => d.total),
            backgroundColor: item.chart_data.map((_, i) => riskColors[i] || "#94a3b8"),
            borderRadius: 6,
            maxBarThickness: 32,
          },
        ],
      };
      const barHeight = Math.max(160, item.chart_data.length * 52);
      return (
        <div style={{ height: `${barHeight}px`, position: "relative", margin: "5px 0" }}>
          <Bar
            data={chartData}
            options={{
              indexAxis: 'y',
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  enabled: true,
                  callbacks: {
                    label: (ctx) => ` ${ctx.parsed.x} household(s)`,
                  },
                },
              },
              scales: {
                x: { ticks: { precision: 0, font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.05)" } },
                y: { ticks: { font: { size: 11 }, mirror: false }, grid: { display: false } },
              },
              layout: { padding: { bottom: 8 } },
            }}
          />
        </div>
      );
    }
  }

  // 3. Top-leads bar charts (uniform green)
  if (
    id === "largest_business_type" ||
    id === "violation_business_type" ||
    id === "barangay_risk" ||
    id === "household_poor_barangays" ||
    id === "household_safe_toilet_barangays" ||
    id === "household_no_water_barangays"
  ) {
    if (item.chart_data && item.chart_data.length > 0) {
      const chartData = {
        labels: item.chart_data.map(d => d.name),
        datasets: [
          {
            data: item.chart_data.map(d => d.total),
            backgroundColor: "#0f7a45",
            borderRadius: 4,
            maxBarThickness: 25,
          },
        ],
      };
      const barHeight = Math.max(200, item.chart_data.length * 42);
      return (
        <div style={{ height: `${barHeight}px`, position: "relative", margin: "5px 0" }}>
          <Bar
            data={chartData}
            options={{
              indexAxis: 'y',
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { enabled: true },
              },
              scales: {
                x: { ticks: { precision: 0, font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.05)" } },
                y: { ticks: { font: { size: 11 }, mirror: false }, grid: { display: false } },
              },
              layout: { padding: { bottom: 8 } },
            }}
          />
        </div>
      );
    }

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
      labels: [`${name} (${value})`, `Others (${others})`],
      datasets: [
        {
          data: [value, others],
          backgroundColor: ["#0f7a45", "#cbd5e1"],
          borderWidth: 0,
        },
      ],
    };

    return (
      <div style={{ height: "180px", position: "relative", margin: "5px 0" }}>
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
                  font: { size: 11, weight: "bold" },
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

      if (id === "household_waste_distribution") {
      if (item.chart_data && item.chart_data.length > 0) {
        const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"];
        const totals = item.chart_data.map(d => d.total);
        const grandTotal = totals.reduce((a, b) => a + b, 0);
        const chartData = {
          labels: item.chart_data.map((d, i) => {
            const pct = grandTotal ? Math.round((d.total / grandTotal) * 100) : 0;
            return `${d.name} (${pct}%)`;
          }),
          datasets: [
            {
              data: totals,
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: "#fff",
            },
          ],
        };
  
        return (
          <div style={{ margin: "5px 0" }}>
            <div style={{ height: "170px", position: "relative" }}>
              <Doughnut
                data={chartData}
                options={{
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: true,
                      position: "right",
                      labels: {
                        boxWidth: 10,
                        font: { size: 11, weight: "bold" },
                        color: "#374151",
                        padding: 6,
                      },
                    },
                    tooltip: {
                      enabled: true,
                      callbacks: {
                        label: (ctx) => {
                          const pct = grandTotal ? Math.round((ctx.parsed / grandTotal) * 100) : 0;
                          return ` ${ctx.parsed} households (${pct}%)`;
                        },
                      },
                    },
                  },
                }}
              />
            </div>
            {/* Print-friendly breakdown table */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px", fontSize: "11px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "4px 6px", color: "#6b7280", fontWeight: "700" }}>Method</th>
                  <th style={{ textAlign: "right", padding: "4px 6px", color: "#6b7280", fontWeight: "700" }}>Count</th>
                  <th style={{ textAlign: "right", padding: "4px 6px", color: "#6b7280", fontWeight: "700" }}>%</th>
                </tr>
              </thead>
              <tbody>
                {item.chart_data.map((d, i) => {
                  const pct = grandTotal ? Math.round((d.total / grandTotal) * 100) : 0;
                  return (
                    <tr key={d.name} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px 6px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: colors[i], flexShrink: 0 }} />
                        {d.name}
                      </td>
                      <td style={{ textAlign: "right", padding: "4px 6px", fontWeight: "700", color: "#111827" }}>{d.total}</td>
                      <td style={{ textAlign: "right", padding: "4px 6px", fontWeight: "800", color: colors[i] }}>{pct}%</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop: "2px solid #e5e7eb" }}>
                  <td style={{ padding: "4px 6px", fontWeight: "800", color: "#111827" }}>Total</td>
                  <td style={{ textAlign: "right", padding: "4px 6px", fontWeight: "800", color: "#111827" }}>{grandTotal}</td>
                  <td style={{ textAlign: "right", padding: "4px 6px", fontWeight: "800", color: "#111827" }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      }
    }

    // 4. Requirements Queue
  if (id === "requirements_queue") {
    const numbers = [...text.matchAll(/\d+/g)].map(Number);
    const completion = numbers[0] || 0;
    const upcoming = numbers[1] || 0;

    const chartData = {
      labels: [`For Completion (${completion})`, `Upcoming Inspection (${upcoming})`],
      datasets: [
        {
          data: [completion, upcoming],
          backgroundColor: ["#f59e0b", "#3b82f6"],
          borderWidth: 0,
        },
      ],
    };

    return (
      <div style={{ height: "180px", position: "relative", margin: "5px 0" }}>
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
                  font: { size: 11, weight: "bold" },
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
      labels: [`Missing Permit Flag (${withoutPermit})`, `No-Permit Status (${noPermitStatus})`],
      datasets: [
        {
          data: [withoutPermit, noPermitStatus],
          backgroundColor: ["#ef4444", "#f97316"],
          borderWidth: 0,
        },
      ],
    };

    return (
      <div style={{ height: "180px", position: "relative", margin: "5px 0" }}>
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
                  font: { size: 11, weight: "bold" },
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
        labels: items.map(item => `${item.label} (${item.value})`),
        datasets: [
          {
            data: items.map(item => item.value),
            backgroundColor: ["#0f7a45", "#3b82f6", "#f59e0b", "#ef4444", "#94a3b8"],
            borderWidth: 0,
          },
        ],
      };

      return (
        <div style={{ height: "180px", position: "relative", margin: "5px 0" }}>
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
                    font: { size: 11, weight: "bold" },
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
        labels: items.map(item => `${item.label} (${item.value})`),
        datasets: [
          {
            data: items.map(item => item.value),
            backgroundColor: ["#10b981", "#3b82f6", "#f59e0b"],
            borderWidth: 0,
          },
        ],
      };

      return (
        <div style={{ height: "180px", position: "relative", margin: "5px 0" }}>
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
                    font: { size: 11, weight: "bold" },
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
  if (id === "geographic_risk" || id === "risk_map") {
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
            maxBarThickness: 25,
          },
        ],
      };

      return (
        <div style={{ height: "180px", position: "relative", margin: "5px 0" }}>
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
                  ticks: { font: { size: 11 }, color: "#64748b" },
                  grid: { color: "rgba(148, 163, 184, 0.1)" },
                },
                y: {
                  ticks: { font: { size: 11 }, color: "#64748b" },
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

  // Generic Fallback
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "15px 0" }}>
      <div style={{
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        background: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#64748b",
        fontSize: "18px",
        flexShrink: 0,
      }}>
        <FiFileText />
      </div>
      <div>
        <strong style={{ fontSize: "16px", fontWeight: "900", color: "#334155", lineHeight: 1.2 }}>
          System Insight
        </strong>
        <span style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", display: "block", marginTop: "2px" }}>
          AI Analytics Output
        </span>
      </div>
    </div>
  );
}
