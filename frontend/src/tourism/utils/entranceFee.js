// Entrance fee for the booking form. The backend computes every stored figure
// with the same rates (services/tourism.py entrance_fee); these drive the
// live breakdown in the Head Count step.
import { formatNumber } from "./format";

export const REGULAR_ENTRANCE_FEE = 80;
export const DISCOUNTED_ENTRANCE_FEE = 64;

function toCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

export function entranceFeeBreakdown(visitors, discounted) {
  const discountedCount = toCount(discounted);
  const regularCount = Math.max(toCount(visitors) - discountedCount, 0);
  const regularAmount = regularCount * REGULAR_ENTRANCE_FEE;
  const discountedAmount = discountedCount * DISCOUNTED_ENTRANCE_FEE;

  return {
    regularCount,
    discountedCount,
    regularAmount,
    discountedAmount,
    total: regularAmount + discountedAmount,
  };
}

// The one-line fee shown under the Discounted field, e.g.
// "Entrance fee: PHP 256 (0 x PHP 80 + 4 x PHP 64)".
export function entranceFeeSummary(visitors, discounted) {
  const fee = entranceFeeBreakdown(visitors, discounted);
  return (
    `Entrance fee: PHP ${formatNumber(fee.total)} ` +
    `(${fee.regularCount} x PHP ${REGULAR_ENTRANCE_FEE} + ` +
    `${fee.discountedCount} x PHP ${DISCOUNTED_ENTRANCE_FEE})`
  );
}

// Children aged 0-7, seniors aged 60+ and special needs are the suggested
// discounted count, capped at the visitor total: one person can be both a
// senior and special needs, and would otherwise be counted twice.
export function suggestedDiscountedCount(form) {
  const visitors = toCount(form.filipino_count) + toCount(form.foreigner_count);
  const suggestion =
    toCount(form.age_0_7) + toCount(form.age_60_above) + toCount(form.special_group_count);
  return Math.min(suggestion, visitors);
}

// While the user has not set the discounted count themselves
// (discounted_edited), it follows the suggestion; once they have, it is left
// alone.
export function followDiscountedSuggestion(form) {
  if (form.discounted_edited) {
    return form;
  }
  return { ...form, discounted_count: String(suggestedDiscountedCount(form)) };
}

// The user typed in the discounted field. A value keeps theirs and stops the
// following; clearing it resumes following. The cleared box stays empty (its
// placeholder shows the suggestion) so they can type a new number, and the
// suggestion is what counts until they do or the ages change.
export function editDiscountedCount(form, value) {
  if (String(value).trim() === "") {
    return { ...form, discounted_count: "", discounted_edited: false };
  }
  return { ...form, discounted_count: value, discounted_edited: true };
}

// The count that is saved and charged.
export function effectiveDiscountedCount(form) {
  if (String(form.discounted_count ?? "").trim() === "") {
    return suggestedDiscountedCount(form);
  }
  return toCount(form.discounted_count);
}

// A stored record follows the ages only if its count still equals the
// suggestion; otherwise someone set it, and it is kept.
export function isDiscountedCountEdited(form) {
  return toCount(form.discounted_count) !== suggestedDiscountedCount(form);
}
