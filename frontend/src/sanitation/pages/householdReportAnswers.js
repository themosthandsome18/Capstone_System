// Household answers use the current ready snapshot, including municipal reports.
// Server report answers may be stale after a household-only retry.
export function buildBarangayHouseholdAnswers(records, barangay) {
  if (!records.length) return [];
  const count = (predicate) => records.filter(predicate).length;
  const total = records.length;
  const coverage = barangay === "all" ? "Mauban" : barangay;
  const good = count((r) => r.status === "good_standing");
  const item = (id, answer, chart_data) => ({ id, answer, chart_data });
  const group = (id, label, predicate, limit) => {
    const groups = new Map();
    records.forEach((record) => {
      const name = record.barangay || "Unspecified";
      groups.set(name, (groups.get(name) || 0) + (predicate(record) ? 1 : 0));
    });
    return item(id, `${coverage}: ${count(predicate)} of ${total} households ${label}.`,
      [...groups].map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, limit));
  };
  const factors = [
    { name: "Unsafe Water Source", total: count((r) => r.water_level === "level_1") },
    { name: "No Toilet Facility", total: count((r) => r.toilet_type === "none") },
    { name: "Improper Waste Disposal", total: count((r) => ["burned", "dumped"].includes(r.waste_disposal)) },
  ];
  const priorities = records.filter((r) => Number.isFinite(r.risk_score) && r.risk_level)
    .slice().sort((a, b) => b.risk_score - a.risk_score).slice(0, 5);
  return [
    group("household_poor_barangays", "need compliance or assistance",
      (r) => ["violation", "for_completion"].includes(r.status), 7),
    group("household_safe_toilet_barangays", "have a recorded toilet facility",
      (r) => ["water_sealed", "pour_flush", "pit_latrine"].includes(r.toilet_type), 5),
    group("household_no_water_barangays", "have Level I water access",
      (r) => r.water_level === "level_1", 5),
    item("household_compliance_rate", `Good Standing: ${good}, Total: ${total}, Rate: ${Math.round(good / total * 1000) / 10}`),
    item("household_waste_distribution", `Waste disposal for ${total} households in ${coverage}.`,
      ["collected", "composted", "burned", "dumped"].map((value) => ({
        name: value[0].toUpperCase() + value.slice(1), total: count((r) => r.waste_disposal === value),
      }))),
    item("priority_households", priorities.length
      ? priorities.map((r) => `${r.household_head} (${r.risk_level})`).join(", ")
      : "No priority ranking available for these household records."),
    item("risk_factor", factors.some((f) => f.total)
      ? `Recorded household risk factors in ${coverage}; a household may have more than one factor.`
      : `No listed risk factors recorded in ${coverage}. This does not establish completed compliance.`, factors),
  ];
}
