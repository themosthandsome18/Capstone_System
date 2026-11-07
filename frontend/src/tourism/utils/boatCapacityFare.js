// Boat Capacity and Fare applies to the boat types whose row says so
// (requires_capacity_fare), not to a boat with a particular name, so renaming
// a boat type cannot switch the rule off.

function findBoatType(boatTypes, boatTypeId) {
  return (boatTypes || []).find((boat) => String(boat.id) === String(boatTypeId));
}

// True only when the boat row is found and explicitly takes a fare, so the
// field stays disabled whenever the rule is unknown.
export function requiresCapacityFare(boatTypes, boatTypeId) {
  return findBoatType(boatTypes, boatTypeId)?.requires_capacity_fare === true;
}

// The fare to keep for a boat type. It is cleared only when the boat row is
// found and explicitly takes no fare. When the rule is unknown (the row did
// not load, or it has no flag) the current fare is kept, never wiped.
export function capacityFareForBoatType(boatTypes, boatTypeId, fare) {
  return findBoatType(boatTypes, boatTypeId)?.requires_capacity_fare === false ? "" : fare;
}

// ---- tying the tier to the head count -------------------------------------------
// A tier may carry min_pax and max_pax (whole numbers, set in Registration Options).
// A tier without both (null, or a payload from an older server) has NO known range:
// it is never picked by the head count and never warned about.

export function hasPaxRange(tier) {
  return Boolean(tier) && Number.isInteger(tier.min_pax) && Number.isInteger(tier.max_pax);
}

export function paxFits(tier, visitors) {
  return hasPaxRange(tier) && visitors >= tier.min_pax && visitors <= tier.max_pax;
}

// "3-4 pax": the real range, as numbers, not cut out of the tier's text.
export function paxLabel(tier) {
  return `${tier.min_pax}-${tier.max_pax} pax`;
}

function inDisplayOrder(tiers) {
  return (tiers || [])
    .map((tier, index) => ({ tier, index }))
    .sort((a, b) => {
      const x = Number.isFinite(a.tier.display_order) ? a.tier.display_order : a.index;
      const y = Number.isFinite(b.tier.display_order) ? b.tier.display_order : b.index;
      return x - y || a.index - b.index;
    })
    .map((entry) => entry.tier);
}

// The tier a head count belongs to: the first ACTIVE tier, in display order, whose
// range holds the number. null when there is none (or the number is not 1 or more).
export function tierForVisitors(tiers, visitors) {
  if (!(visitors >= 1)) return null;
  return inDisplayOrder(tiers).find((tier) => tier.is_active !== false && paxFits(tier, visitors)) || null;
}

// The tier text the form should hold after the head count went from `before` to
// `after`. Only the TIER is written, never the count. Nothing changes when the boat
// asks for no fare, when the count did not change or is not 1 or more, when the
// tier already chosen fits the new count, or when no tier fits it.
export function fareFollowingTotal({ tiers, fare, before, after, requiresFare }) {
  if (!requiresFare || !(after >= 1) || after === before) return fare;
  const chosen = (tiers || []).find((tier) => tier.name === fare);
  if (paxFits(chosen, after)) return fare;
  const match = tierForVisitors(tiers, after);
  return match ? match.name : fare;
}

// A sentence for the staff when the tier chosen does not hold the head count, else "".
// It only informs: the count is not changed and saving is not stopped.
export function paxMismatchWarning({ tiers, fare, visitors, requiresFare }) {
  if (!requiresFare || !(visitors >= 1)) return "";
  const chosen = (tiers || []).find((tier) => tier.name === fare);
  if (!hasPaxRange(chosen) || paxFits(chosen, visitors)) return "";
  const who = visitors === 1 ? "1 visitor does" : `${visitors} visitors do`;
  return `${who} not fit ${paxLabel(chosen)}.`;
}
