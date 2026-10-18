// The choices of the "Boat Capacity and Fare" dropdown of the record form.
//
// A record keeps its tier as TEXT, exactly as it was when the record was saved
// (TouristRecord.boat_capacity_fare). Nothing points at a tier by id, so the
// text the record holds may be a tier that is listed and active, one that has
// been retired, or no tier at all (an old app, an Excel import, a tier that was
// renamed before it had records). The dropdown must show whichever it is: if the
// text the record holds had no option, a <select> would show its FIRST option and
// the form would look empty while the record still holds a fare. Saving it, or
// changing something else, would then be a quiet change to the LGU's data.
//
// Three states, then, for the text the record held when it was opened (keepText):
//   a) listed and active           -> an ordinary option;
//   b) listed but inactive         -> kept, in its place by display_order, marked
//                                     "(inactive)", and it is the selected one;
//   c) not in the table at all     -> added at the end, marked "(not in the
//                                     list)", and it is the selected one.
// The value of every option is the text itself, byte for byte: it is what is
// sent when the record is saved.
import { INACTIVE_MARK } from "./optionChoices";

export const NOT_IN_LIST_MARK = " (not in the list)";

function holds(keepText) {
  return typeof keepText === "string" && keepText !== "";
}

// The tiers to offer. A payload that has no list (an older server) falls back to
// the built-in names; a list that is there but empty is a real, empty list.
export function fareTiers(payloadTiers, builtInNames) {
  if (Array.isArray(payloadTiers)) return payloadTiers;
  return builtInNames.map((name, index) => ({ name, display_order: (index + 1) * 10, is_active: true }));
}

function inDisplayOrder(tiers) {
  return tiers
    .map((tier, index) => ({ tier, index }))
    .sort((a, b) => {
      const x = Number.isFinite(a.tier.display_order) ? a.tier.display_order : a.index;
      const y = Number.isFinite(b.tier.display_order) ? b.tier.display_order : b.index;
      return x - y || a.index - b.index;
    })
    .map((entry) => entry.tier);
}

export function fareChoicesFor(tiers = [], keepText = null) {
  const kept = holds(keepText);
  const choices = inDisplayOrder(tiers || [])
    .filter((tier) => tier.is_active !== false || (kept && tier.name === keepText))
    .map((tier) => ({
      value: tier.name,
      label: tier.is_active === false ? `${tier.name}${INACTIVE_MARK}` : tier.name,
    }));

  const listed = (tiers || []).some((tier) => tier.name === keepText);
  if (kept && !listed) {
    choices.push({ value: keepText, label: `${keepText}${NOT_IN_LIST_MARK}` });
  }
  return choices;
}
